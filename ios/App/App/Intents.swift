import AppIntents
import Foundation
import WebKit

/**
 * Siri: "Hey Siri, clock me in with WorkBench" / "clock me out" / "next job".
 *
 * App Intents (iOS 16+). The clock intents run WITHOUT opening the app:
 * they read the session cookie the app's webview holds, ask the server for
 * "my next job" (GET /api/app/siri/next-job — the job I'm clocked into,
 * else my next scheduled one) and POST the clock action to the same route
 * the app's Clock in button uses. Siri confirms in words. "Next job" opens
 * the app on the universal link the URL tier already served
 * (/app/go/next-job), so the Shortcuts-app recipe and this stay in step.
 *
 * `WorkBenchShortcuts` donates the phrases so they show in Spotlight and
 * the Shortcuts app with no setup. A phone that is signed out gets a 401
 * and Siri says so; nothing here stores credentials.
 */

private let siteOrigin = URL(string: "https://workbenchfsm.com")!

private struct NextJob: Decodable {
    let id: String
    let title: String
    let clockedIn: Bool
}

private struct NextJobReply: Decodable {
    let job: NextJob?
}

private enum SiriError: Error, CustomLocalizedStringResourceConvertible {
    case signedOut
    case noJob
    case server

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .signedOut: return "Open WorkBench and sign in first."
        case .noJob: return "You have no job to clock into right now."
        case .server: return "WorkBench didn't answer. Try again in a moment."
        }
    }
}

/// The app's webview cookies, as a Cookie header — must be read on the main thread.
@MainActor
private func cookieHeader() async -> String {
    let store = WKWebsiteDataStore.default().httpCookieStore
    let cookies: [HTTPCookie] = await withCheckedContinuation { cont in
        store.getAllCookies { cont.resume(returning: $0) }
    }
    return cookies
        .filter { siteOrigin.host.map($0.domain.hasSuffix) ?? false }
        .map { "\($0.name)=\($0.value)" }
        .joined(separator: "; ")
}

private func request(_ path: String, method: String = "GET", json: [String: Any]? = nil) async throws -> (Int, Data) {
    var req = URLRequest(url: siteOrigin.appendingPathComponent(path))
    req.httpMethod = method
    req.setValue(await cookieHeader(), forHTTPHeaderField: "Cookie")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    // The server keys the shell off this suffix (lib/sign-in-options.ts).
    req.setValue("WorkBench Siri StreamflaireHubShell", forHTTPHeaderField: "User-Agent")
    if let json = json {
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: json)
    }
    let (data, response) = try await URLSession.shared.data(for: req)
    return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
}

private func nextJob() async throws -> NextJob? {
    let (status, data) = try await request("/api/app/siri/next-job")
    if status == 401 { throw SiriError.signedOut }
    guard status == 200 else { throw SiriError.server }
    return try JSONDecoder().decode(NextJobReply.self, from: data).job
}

private func clock(_ action: String, job: NextJob) async throws {
    let (status, _) = try await request(
        "/api/app/jobs/\(job.id)/clock",
        method: "POST",
        json: ["action": action, "clientKey": "siri:\(UUID().uuidString)"]
    )
    if status == 401 { throw SiriError.signedOut }
    guard status == 200 else { throw SiriError.server }
}

@available(iOS 16.0, *)
struct ClockInIntent: AppIntent {
    static var title: LocalizedStringResource = "Clock in"
    static var description = IntentDescription("Clock in to your next WorkBench job.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let job = try await nextJob() else { throw SiriError.noJob }
        if job.clockedIn {
            return .result(dialog: "You're already clocked in to \(job.title).")
        }
        try await clock("in", job: job)
        return .result(dialog: "Clocked in to \(job.title).")
    }
}

@available(iOS 16.0, *)
struct ClockOutIntent: AppIntent {
    static var title: LocalizedStringResource = "Clock out"
    static var description = IntentDescription("Clock out of the WorkBench job you're on.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let job = try await nextJob(), job.clockedIn else {
            return .result(dialog: "You're not clocked in to anything.")
        }
        try await clock("out", job: job)
        return .result(dialog: "Clocked out of \(job.title).")
    }
}

@available(iOS 16.0, *)
struct OpenNextJobIntent: AppIntent {
    static var title: LocalizedStringResource = "Next job"
    static var description = IntentDescription("Open your next WorkBench job.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult & OpensIntent {
        // The universal link lands inside the app (NativeShell's appUrlOpen).
        return .result(opensIntent: OpenURLIntent(siteOrigin.appendingPathComponent("/app/go/next-job")))
    }
}

@available(iOS 16.0, *)
struct WorkBenchShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ClockInIntent(),
            phrases: ["Clock me in with \(.applicationName)", "Clock in with \(.applicationName)", "Start my job in \(.applicationName)"],
            shortTitle: "Clock in",
            systemImageName: "clock.badge.checkmark"
        )
        AppShortcut(
            intent: ClockOutIntent(),
            phrases: ["Clock me out with \(.applicationName)", "Clock out with \(.applicationName)", "End my job in \(.applicationName)"],
            shortTitle: "Clock out",
            systemImageName: "clock.badge.xmark"
        )
        AppShortcut(
            intent: OpenNextJobIntent(),
            phrases: ["Next job in \(.applicationName)", "Open my next job in \(.applicationName)", "What's my next job in \(.applicationName)"],
            shortTitle: "Next job",
            systemImageName: "wrench.and.screwdriver"
        )
    }
}
