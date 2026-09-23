import AppIntents
import Capacitor
import Foundation
import UIKit
import WebKit

/**
 * Siri, hands-free (App Intents, iOS 16+):
 *
 *   "Clock me in with WorkBench"            → next job, clock in
 *   "Clock me out with WorkBench"           → the job I'm on, clock out
 *   "Next job in WorkBench"                 → opens the job (universal link)
 *   "Call Maria Lopez with WorkBench"       → the business line calls her:
 *                                             your cell rings, "press 1",
 *                                             then she is dialed
 *   "Text Maria Lopez with WorkBench"       → Siri asks what to say; it
 *                                             goes out from the line
 *   "Tell my next client I'm on my way"     → the On my way text, from the
 *                                             line, job stamped and noted
 *   "Call back my last missed call"         → redials the last missed call
 *   "Add a note in WorkBench"               → dictated, onto the job I'm on
 *   "What's my day look like in WorkBench"  → reads today's schedule
 *
 * Everything but "next job" runs WITHOUT opening the app: the intent reads
 * the session cookie the app's webview holds and talks to the same routes
 * the app uses (plus a few read-only ones under /api/app/siri that answer
 * in words). A phone that is signed out gets a 401 and Siri says so;
 * nothing here stores credentials.
 *
 * `WorkBenchShortcuts` donates the phrases so they show in Spotlight and
 * the Shortcuts app with no setup.
 */

let siteOrigin = URL(string: "https://workbenchfsm.com")!

// MARK: - Wire types

private struct NextJob: Decodable {
    let id: String
    let title: String
    let clockedIn: Bool
}

private struct NextJobReply: Decodable { let job: NextJob? }

private struct ContactRow: Decodable {
    let id: String
    let name: String
    let phone: String?
}

private struct ContactsReply: Decodable { let contacts: [ContactRow] }

private struct TodayReply: Decodable { let summary: String }

private struct MissedCall: Decodable {
    let number: String
    let label: String
}

private struct MissedReply: Decodable { let call: MissedCall? }

private struct OnMyWayReply: Decodable { let client: String }

private struct ErrorReply: Decodable { let error: String? }

@available(iOS 16.0, *)
private enum SiriError: Error, CustomLocalizedStringResourceConvertible {
    case signedOut
    case noJob
    case notOnJob
    case noMissed
    case refused(String)
    case server

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .signedOut: return "Open WorkBench and sign in first."
        case .noJob: return "You have no job to clock into right now."
        case .notOnJob: return "You're not clocked in to a job right now."
        case .noMissed: return "There's no missed call to return."
        case .refused(let why): return "\(why)"
        case .server: return "WorkBench didn't answer. Try again in a moment."
        }
    }
}

// MARK: - Talking to the site

/// The app's webview cookies, as a Cookie header — must be read on the main thread. Shared with VoipPlugin.swift.
@MainActor
func siteCookieHeader() async -> String {
    let store = WKWebsiteDataStore.default().httpCookieStore
    var cookies: [HTTPCookie] = await withCheckedContinuation { cont in
        store.getAllCookies { cont.resume(returning: $0) }
    }
    cookies = cookies.filter { siteOrigin.host.map($0.domain.hasSuffix) ?? false }
    // The webview's store can come back empty on a cold background launch
    // before any web view exists; the shared jar is the fallback.
    if cookies.isEmpty { cookies = HTTPCookieStorage.shared.cookies(for: siteOrigin) ?? [] }
    return cookies
        .map { "\($0.name)=\($0.value)" }
        .joined(separator: "; ")
}

/// A request to the site as the signed-in person (the webview's cookies). Shared with VoipPlugin.swift.
func siteRequest(_ path: String, query: [String: String] = [:], method: String = "GET", json: [String: Any]? = nil) async throws -> (Int, Data) {
    var comps = URLComponents(url: siteOrigin.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
    var req = URLRequest(url: comps.url!)
    req.httpMethod = method
    req.setValue(await siteCookieHeader(), forHTTPHeaderField: "Cookie")
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

/// 401 → signed out; 4xx with an error message → that message; anything else → server.
@available(iOS 16.0, *)
private func check(_ status: Int, _ data: Data) throws {
    if status == 401 { throw SiriError.signedOut }
    if (200...299).contains(status) { return }
    if let why = (try? JSONDecoder().decode(ErrorReply.self, from: data))?.error, status < 500 {
        throw SiriError.refused(why)
    }
    throw SiriError.server
}

@available(iOS 16.0, *)
private func nextJob() async throws -> NextJob? {
    let (status, data) = try await siteRequest("/api/app/siri/next-job")
    try check(status, data)
    return try JSONDecoder().decode(NextJobReply.self, from: data).job
}

@available(iOS 16.0, *)
private func clock(_ action: String, job: NextJob) async throws {
    let (status, data) = try await siteRequest(
        "/api/app/jobs/\(job.id)/clock",
        method: "POST",
        json: ["action": action, "clientKey": "siri:\(UUID().uuidString)"]
    )
    try check(status, data)
}

/// Place a call from the business line: rings the person's cell first, whispers who it's for, then dials the client.
@available(iOS 16.0, *)
private func placeCall(contactId: String?, to: String?) async throws {
    var json: [String: Any] = ["via": "cell"]
    if let contactId = contactId { json["contactId"] = contactId }
    if let to = to { json["to"] = to }
    let (status, data) = try await siteRequest("/api/app/line/call", method: "POST", json: json)
    try check(status, data)
}

// MARK: - Clients, as something Siri can name

@available(iOS 16.0, *)
struct ClientEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Client")
    static var defaultQuery = ClientQuery()

    var id: String
    var name: String
    var phone: String?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: phone.map { "\($0)" })
    }
}

@available(iOS 16.0, *)
struct ClientQuery: EntityStringQuery {
    private func fetch(_ query: [String: String]) async throws -> [ClientEntity] {
        let (status, data) = try await siteRequest("/api/app/siri/contacts", query: query)
        try check(status, data)
        return try JSONDecoder().decode(ContactsReply.self, from: data).contacts.map {
            ClientEntity(id: $0.id, name: $0.name, phone: $0.phone)
        }
    }

    func entities(for identifiers: [String]) async throws -> [ClientEntity] {
        try await fetch(["ids": identifiers.joined(separator: ",")])
    }

    func entities(matching string: String) async throws -> [ClientEntity] {
        try await fetch(["q": string])
    }

    func suggestedEntities() async throws -> [ClientEntity] {
        try await fetch([:])
    }
}

// MARK: - Intents

@available(iOS 16.0, *)
struct ClockInIntent: AppIntent {
    static var title: LocalizedStringResource = "Clock in"
    static var description = IntentDescription("Clock in to your next WorkBench job.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let job = try await nextJob() else { throw SiriError.noJob }
        if job.clockedIn { return .result(dialog: "You're already clocked in to \(job.title).") }
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
        guard let job = try await nextJob(), job.clockedIn else { throw SiriError.notOnJob }
        try await clock("out", job: job)
        return .result(dialog: "Clocked out of \(job.title).")
    }
}

@available(iOS 16.0, *)
struct OpenNextJobIntent: AppIntent {
    static var title: LocalizedStringResource = "Next job"
    static var description = IntentDescription("Open your next WorkBench job.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        // OpenURLIntent is iOS 18+, so hand the universal link to Capacitor the
        // way iOS itself would: the App plugin turns this into appUrlOpen
        // (retained until the page attaches, so a cold start works too) and
        // NativeShell navigates there.
        NotificationCenter.default.post(
            name: .capacitorOpenUniversalLink,
            object: ["url": siteOrigin.appendingPathComponent("/app/go/next-job")]
        )
        return .result()
    }
}

@available(iOS 16.0, *)
struct CallClientIntent: AppIntent {
    static var title: LocalizedStringResource = "Call a client"
    static var description = IntentDescription("Call a client from your business line. Your phone rings first, then the client.")
    static var openAppWhenRun = false

    @Parameter(title: "Client", requestValueDialog: "Who do you want to call?")
    var client: ClientEntity

    static var parameterSummary: some ParameterSummary { Summary("Call \(\.$client) from the business line") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await placeCall(contactId: client.id, to: nil)
        return .result(dialog: "Calling \(client.name) from your business line. Answer your phone and press 1.")
    }
}

@available(iOS 16.0, *)
struct TextClientIntent: AppIntent {
    static var title: LocalizedStringResource = "Text a client"
    static var description = IntentDescription("Send a client a text from your business line.")
    static var openAppWhenRun = false

    @Parameter(title: "Client", requestValueDialog: "Who do you want to text?")
    var client: ClientEntity

    @Parameter(title: "Message", requestValueDialog: "What should it say?")
    var message: String

    static var parameterSummary: some ParameterSummary { Summary("Text \(\.$client): \(\.$message)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw SiriError.refused("The message was empty.") }
        let (status, data) = try await siteRequest("/api/app/messages/\(client.id)", method: "POST", json: ["body": text])
        try check(status, data)
        return .result(dialog: "Sent to \(client.name).")
    }
}

@available(iOS 16.0, *)
struct OnMyWayIntent: AppIntent {
    static var title: LocalizedStringResource = "On my way"
    static var description = IntentDescription("Text the client of your next job that you're on your way.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let (status, data) = try await siteRequest("/api/app/siri/on-my-way", method: "POST", json: [:])
        if status == 404 { throw SiriError.noJob }
        try check(status, data)
        let reply = try JSONDecoder().decode(OnMyWayReply.self, from: data)
        return .result(dialog: "Told \(reply.client) you're on your way.")
    }
}

@available(iOS 16.0, *)
struct CallBackMissedIntent: AppIntent {
    static var title: LocalizedStringResource = "Call back last missed call"
    static var description = IntentDescription("Return the last missed call on your business line.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let (status, data) = try await siteRequest("/api/app/siri/last-missed")
        try check(status, data)
        guard let call = try JSONDecoder().decode(MissedReply.self, from: data).call else { throw SiriError.noMissed }
        try await placeCall(contactId: nil, to: call.number)
        return .result(dialog: "Calling \(call.label) back. Answer your phone and press 1.")
    }
}

@available(iOS 16.0, *)
struct AddJobNoteIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a job note"
    static var description = IntentDescription("Add a note to the WorkBench job you're clocked into.")
    static var openAppWhenRun = false

    @Parameter(title: "Note", requestValueDialog: "What's the note?")
    var note: String

    static var parameterSummary: some ParameterSummary { Summary("Add note \(\.$note) to my current job") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw SiriError.refused("The note was empty.") }
        guard let job = try await nextJob(), job.clockedIn else { throw SiriError.notOnJob }
        let (status, data) = try await siteRequest(
            "/api/app/jobs/\(job.id)/notes",
            method: "POST",
            json: ["body": text, "clientKey": "siri:\(UUID().uuidString)"]
        )
        try check(status, data)
        return .result(dialog: "Added to \(job.title).")
    }
}

@available(iOS 16.0, *)
struct TodayIntent: AppIntent {
    static var title: LocalizedStringResource = "My day"
    static var description = IntentDescription("Hear today's WorkBench schedule.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let (status, data) = try await siteRequest("/api/app/siri/today")
        try check(status, data)
        let reply = try JSONDecoder().decode(TodayReply.self, from: data)
        return .result(dialog: "\(reply.summary)")
    }
}

// MARK: - Phrases

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
        AppShortcut(
            intent: CallClientIntent(),
            phrases: ["Call \(\.$client) with \(.applicationName)", "Call \(\.$client) from my business line in \(.applicationName)", "Call a client with \(.applicationName)"],
            shortTitle: "Call a client",
            systemImageName: "phone"
        )
        AppShortcut(
            intent: TextClientIntent(),
            phrases: ["Text \(\.$client) with \(.applicationName)", "Message \(\.$client) with \(.applicationName)", "Text a client with \(.applicationName)"],
            shortTitle: "Text a client",
            systemImageName: "message"
        )
        AppShortcut(
            intent: OnMyWayIntent(),
            phrases: ["Tell my next client I'm on my way with \(.applicationName)", "On my way in \(.applicationName)", "Send on my way with \(.applicationName)"],
            shortTitle: "On my way",
            systemImageName: "car"
        )
        AppShortcut(
            intent: CallBackMissedIntent(),
            phrases: ["Call back my last missed call with \(.applicationName)", "Return my missed call in \(.applicationName)"],
            shortTitle: "Call back",
            systemImageName: "phone.arrow.up.right"
        )
        AppShortcut(
            intent: AddJobNoteIntent(),
            phrases: ["Add a note in \(.applicationName)", "Add a job note with \(.applicationName)", "Note this in \(.applicationName)"],
            shortTitle: "Add a note",
            systemImageName: "note.text.badge.plus"
        )
        AppShortcut(
            intent: TodayIntent(),
            phrases: ["What's my day look like in \(.applicationName)", "What's on my schedule in \(.applicationName)", "My day in \(.applicationName)"],
            shortTitle: "My day",
            systemImageName: "calendar"
        )
    }
}
