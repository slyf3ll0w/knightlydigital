import AppIntents
import Capacitor
import Foundation
import UIKit
import WebKit

/**
 * Siri, hands-free (App Intents, iOS 16.4+). Ten shortcuts — Apple's cap —
 * so related actions share one shortcut and the spoken word picks:
 *
 *   "Clock me in / out with WorkBench"       → next job, clock in; the job
 *                                              I'm on, clock out
 *   "Next job in WorkBench"                  → opens the job
 *   "Directions to my next job in WorkBench" → Apple Maps to the job address
 *   "What's my day look like in WorkBench"   → reads today's schedule
 *   "What's my next job in WorkBench"        → title, client, when
 *   "What's my time on this job …"           → how long I've been clocked in
 *   "Complete my job in WorkBench"           → the job I'm on → Requires
 *                                              Invoicing (checklist gate and
 *                                              all, same as the button)
 *   "Call / Text my next client with …"      → the next job's client
 *   "Call Maria Lopez with WorkBench"        → a named client
 *   "Text Maria Lopez with WorkBench"        → Siri asks what to say
 *   "Tell my next client I'm on my way"      → the On my way text, job
 *                                              stamped and noted
 *   "Call back my last missed call"          → redials the last missed call
 *   "Add a note in WorkBench"                → dictated, onto the job I'm on
 *
 * Calls and texts do what the app's own buttons do (/api/app/siri/line):
 * a company with a business line calls from it (your cell rings, "press 1",
 * then the client is dialed) and texts from it through the client thread;
 * a company without one gets the phone's own dialer or Messages app, with
 * the number and text filled in. The second path needs the app in front —
 * `ForegroundContinuableIntent` asks Siri to bring it forward — which is
 * why the floor is iOS 16.4.
 *
 * Everything else runs WITHOUT opening the app: the intent reads the
 * session cookie the app's webview holds and talks to the same routes the
 * app uses (plus a few read-only ones under /api/app/siri that answer in
 * words). A phone that is signed out gets a 401 and Siri says so; nothing
 * here stores credentials.
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
    let contactId: String
    let contactFirstName: String
    let contactPhone: String?
    let address: String?
    /// "today at 2:30 pm", "tomorrow at 9 am" — the server writes it (it knows the company's timezone).
    let when: String?
    /// "1h 20m" while clocked in, else nil.
    let onClock: String?
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

private struct OnMyWayReply: Decodable {
    let client: String
    let handoff: Bool?
    let phone: String?
    let body: String?
}

private struct LineReply: Decodable {
    let call: Bool
    let text: Bool
}

private struct ErrorReply: Decodable { let error: String? }

@available(iOS 16.4, *)
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
@available(iOS 16.4, *)
private func check(_ status: Int, _ data: Data) throws {
    if status == 401 { throw SiriError.signedOut }
    if (200...299).contains(status) { return }
    if let why = (try? JSONDecoder().decode(ErrorReply.self, from: data))?.error, status < 500 {
        throw SiriError.refused(why)
    }
    throw SiriError.server
}

@available(iOS 16.4, *)
private func nextJob() async throws -> NextJob? {
    let (status, data) = try await siteRequest("/api/app/siri/next-job")
    try check(status, data)
    return try JSONDecoder().decode(NextJobReply.self, from: data).job
}

@available(iOS 16.4, *)
private func clock(_ action: String, job: NextJob) async throws {
    let (status, data) = try await siteRequest(
        "/api/app/jobs/\(job.id)/clock",
        method: "POST",
        json: ["action": action, "clientKey": "siri:\(UUID().uuidString)"]
    )
    try check(status, data)
}

@available(iOS 16.4, *)
private func lineStatus() async throws -> LineReply {
    let (status, data) = try await siteRequest("/api/app/siri/line")
    try check(status, data)
    return try JSONDecoder().decode(LineReply.self, from: data)
}

// MARK: - Reaching a client: the business line, or the phone itself

/// Digits plus a leading "+", the way the app's tel:/sms: links are built (lib/messaging.ts).
private func dialable(_ phone: String) -> String {
    let digits = phone.filter(\.isNumber)
    return phone.trimmingCharacters(in: .whitespaces).hasPrefix("+") ? "+" + digits : digits
}

private let urlSafe = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))

/// The phone's own dialer.
@MainActor
private func openDialer(phone: String) async -> Bool {
    guard let url = URL(string: "tel:\(dialable(phone))") else { return false }
    return await UIApplication.shared.open(url)
}

/// The phone's Messages app, number and text filled in. iOS reads `sms:number&body=` (not `?`), so it is built by hand.
@MainActor
private func openMessages(phone: String, body: String) async -> Bool {
    let encoded = body.addingPercentEncoding(withAllowedCharacters: urlSafe) ?? ""
    guard let url = URL(string: "sms:\(dialable(phone))&body=\(encoded)") else { return false }
    return await UIApplication.shared.open(url)
}

/// Bringing the app forward is the intent's own call (`requestToContinueInForeground`); the helpers take it as a closure.
private typealias ComeForward = () async throws -> Void

/// Call someone the way the app's Call button would: from the business line
/// when the company has one on the voice app (the cell rings first, press 1),
/// else the phone's dialer. `contactId` or `to` names the callee for the line.
@available(iOS 16.4, *)
private func placeCall(contactId: String?, to: String?, name: String, phone: String?, comeForward: ComeForward) async throws -> String {
    if try await lineStatus().call {
        var json: [String: Any] = ["via": "cell"]
        if let contactId = contactId { json["contactId"] = contactId }
        if let to = to { json["to"] = to }
        let (status, data) = try await siteRequest("/api/app/line/call", method: "POST", json: json)
        try check(status, data)
        return "Calling \(name) from your business line. Answer your phone and press 1."
    }
    guard let phone = phone ?? to, !dialable(phone).isEmpty else { throw SiriError.refused("\(name) has no phone number.") }
    try await comeForward()
    guard await openDialer(phone: phone) else { throw SiriError.refused("Couldn't open the phone app.") }
    return "Calling \(name)."
}

/// Text someone the way the app would: from the business line through the
/// client thread when the company can send texts, else the phone's Messages
/// app with the text filled in (free, and replies come to the tech's own number).
@available(iOS 16.4, *)
private func sendText(contactId: String, name: String, phone: String?, body: String, comeForward: ComeForward) async throws -> String {
    if try await lineStatus().text {
        let (status, data) = try await siteRequest("/api/app/messages/\(contactId)", method: "POST", json: ["body": body])
        try check(status, data)
        return "Sent to \(name) from your business line."
    }
    guard let phone = phone, !dialable(phone).isEmpty else { throw SiriError.refused("\(name) has no phone number.") }
    try await comeForward()
    guard await openMessages(phone: phone, body: body) else { throw SiriError.refused("Couldn't open Messages.") }
    return "Your text to \(name) is ready to send in Messages."
}

// MARK: - Clients, as something Siri can name

@available(iOS 16.4, *)
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

@available(iOS 16.4, *)
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

// MARK: - The words that pick within a shortcut

@available(iOS 16.4, *)
enum ClockDirection: String, AppEnum {
    case clockIn = "in"
    case clockOut = "out"

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Direction")
    static var caseDisplayRepresentations: [ClockDirection: DisplayRepresentation] = [
        .clockIn: "in",
        .clockOut: "out",
    ]
}

@available(iOS 16.4, *)
enum NextJobAction: String, AppEnum {
    case open
    case directions

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Action")
    static var caseDisplayRepresentations: [NextJobAction: DisplayRepresentation] = [
        .open: "Open my next job",
        .directions: "Directions to my next job",
    ]
}

@available(iOS 16.4, *)
enum DayQuestion: String, AppEnum {
    case day
    case nextJob
    case timeOnJob

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Question")
    static var caseDisplayRepresentations: [DayQuestion: DisplayRepresentation] = [
        .day: "my day",
        .nextJob: "my next job",
        .timeOnJob: "my time on this job",
    ]
}

@available(iOS 16.4, *)
enum ReachHow: String, AppEnum {
    case call
    case text

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "How")
    static var caseDisplayRepresentations: [ReachHow: DisplayRepresentation] = [
        .call: "Call",
        .text: "Text",
    ]
}

// MARK: - Intents

@available(iOS 16.4, *)
struct ClockIntent: AppIntent {
    static var title: LocalizedStringResource = "Clock in or out"
    static var description = IntentDescription("Clock in to your next WorkBench job, or out of the one you're on.")
    static var openAppWhenRun = false

    @Parameter(title: "Direction")
    var direction: ClockDirection

    static var parameterSummary: some ParameterSummary { Summary("Clock \(\.$direction)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        switch direction {
        case .clockIn:
            guard let job = try await nextJob() else { throw SiriError.noJob }
            if job.clockedIn { return .result(dialog: "You're already clocked in to \(job.title).") }
            try await clock("in", job: job)
            return .result(dialog: "Clocked in to \(job.title).")
        case .clockOut:
            guard let job = try await nextJob(), job.clockedIn else { throw SiriError.notOnJob }
            try await clock("out", job: job)
            return .result(dialog: "Clocked out of \(job.title).")
        }
    }
}

@available(iOS 16.4, *)
struct OpenNextJobIntent: AppIntent {
    static var title: LocalizedStringResource = "Next job"
    static var description = IntentDescription("Open your next WorkBench job, or get directions to it.")
    static var openAppWhenRun = true

    @Parameter(title: "Action", default: .open)
    var action: NextJobAction

    static var parameterSummary: some ParameterSummary { Summary("\(\.$action)") }

    @MainActor
    func perform() async throws -> some IntentResult {
        switch action {
        case .open:
            // OpenURLIntent is iOS 18+, so hand the universal link to Capacitor the
            // way iOS itself would: the App plugin turns this into appUrlOpen
            // (retained until the page attaches, so a cold start works too) and
            // NativeShell navigates there.
            NotificationCenter.default.post(
                name: .capacitorOpenUniversalLink,
                object: ["url": siteOrigin.appendingPathComponent("/app/go/next-job")]
            )
        case .directions:
            guard let job = try await nextJob() else { throw SiriError.noJob }
            guard let address = job.address?.trimmingCharacters(in: .whitespacesAndNewlines), !address.isEmpty else {
                throw SiriError.refused("\(job.title) has no address on it.")
            }
            var comps = URLComponents(string: "https://maps.apple.com/")!
            comps.queryItems = [URLQueryItem(name: "daddr", value: address), URLQueryItem(name: "dirflg", value: "d")]
            guard let url = comps.url, await UIApplication.shared.open(url) else {
                throw SiriError.refused("Couldn't open Maps.")
            }
        }
        return .result()
    }
}

@available(iOS 16.4, *)
struct TodayIntent: AppIntent {
    static var title: LocalizedStringResource = "My day"
    static var description = IntentDescription("Hear today's WorkBench schedule, your next job, or your time on the job you're on.")
    static var openAppWhenRun = false

    @Parameter(title: "Question", default: .day)
    var question: DayQuestion

    static var parameterSummary: some ParameterSummary { Summary("What's \(\.$question)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        switch question {
        case .day:
            let (status, data) = try await siteRequest("/api/app/siri/today")
            try check(status, data)
            let reply = try JSONDecoder().decode(TodayReply.self, from: data)
            return .result(dialog: "\(reply.summary)")
        case .nextJob:
            guard let job = try await nextJob() else { return .result(dialog: "Nothing is on the schedule next.") }
            if job.clockedIn {
                let sofar = job.onClock.map { ", \($0) so far" } ?? ""
                return .result(dialog: "You're on \(job.title) for \(job.contactFirstName)\(sofar).")
            }
            return .result(dialog: "Your next job is \(job.title) for \(job.contactFirstName), \(job.when ?? "not scheduled yet").")
        case .timeOnJob:
            guard let job = try await nextJob(), job.clockedIn else { throw SiriError.notOnJob }
            return .result(dialog: "You've been on \(job.title) for \(job.onClock ?? "less than a minute").")
        }
    }
}

@available(iOS 16.4, *)
struct CompleteJobIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete my job"
    static var description = IntentDescription("Mark the WorkBench job you're clocked into complete. It moves to Requires Invoicing for the office.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let job = try await nextJob(), job.clockedIn else { throw SiriError.notOnJob }
        // Same route as the Complete Job button: the checklist gate and the
        // clock-out note happen there, and its refusal is read back as is.
        let (status, data) = try await siteRequest("/api/app/jobs/\(job.id)/status", method: "PATCH", json: ["status": "REQUIRES_INVOICING"])
        try check(status, data)
        return .result(dialog: "\(job.title) is complete and ready to invoice.")
    }
}

@available(iOS 16.4, *)
struct ReachNextClientIntent: AppIntent, ForegroundContinuableIntent {
    static var title: LocalizedStringResource = "Call or text my next client"
    static var description = IntentDescription("Call or text the client of your next WorkBench job — from your business line, or from your phone if there isn't one.")
    static var openAppWhenRun = false

    @Parameter(title: "How")
    var how: ReachHow

    @Parameter(title: "Message")
    var message: String?

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$how) my next client") {
            \.$message
        }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let job = try await nextJob() else { throw SiriError.noJob }
        let name = job.contactFirstName
        switch how {
        case .call:
            let said = try await placeCall(contactId: job.contactId, to: nil, name: name, phone: job.contactPhone) {
                try await requestToContinueInForeground("Open the phone app to call \(name)?")
            }
            return .result(dialog: "\(said)")
        case .text:
            let text = (message ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { throw $message.needsValueError("What should it say?") }
            let said = try await sendText(contactId: job.contactId, name: name, phone: job.contactPhone, body: text) {
                try await requestToContinueInForeground("Open Messages to text \(name)?")
            }
            return .result(dialog: "\(said)")
        }
    }
}

@available(iOS 16.4, *)
struct CallClientIntent: AppIntent, ForegroundContinuableIntent {
    static var title: LocalizedStringResource = "Call a client"
    static var description = IntentDescription("Call a client from your business line (your phone rings first, then the client), or from your phone if there's no line.")
    static var openAppWhenRun = false

    @Parameter(title: "Client", requestValueDialog: "Who do you want to call?")
    var client: ClientEntity

    static var parameterSummary: some ParameterSummary { Summary("Call \(\.$client)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let said = try await placeCall(contactId: client.id, to: nil, name: client.name, phone: client.phone) {
            try await requestToContinueInForeground("Open the phone app to call \(client.name)?")
        }
        return .result(dialog: "\(said)")
    }
}

@available(iOS 16.4, *)
struct TextClientIntent: AppIntent, ForegroundContinuableIntent {
    static var title: LocalizedStringResource = "Text a client"
    static var description = IntentDescription("Text a client from your business line, or from your phone's Messages app if there's no line.")
    static var openAppWhenRun = false

    @Parameter(title: "Client", requestValueDialog: "Who do you want to text?")
    var client: ClientEntity

    @Parameter(title: "Message", requestValueDialog: "What should it say?")
    var message: String

    static var parameterSummary: some ParameterSummary { Summary("Text \(\.$client): \(\.$message)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw SiriError.refused("The message was empty.") }
        let said = try await sendText(contactId: client.id, name: client.name, phone: client.phone, body: text) {
            try await requestToContinueInForeground("Open Messages to text \(client.name)?")
        }
        return .result(dialog: "\(said)")
    }
}

@available(iOS 16.4, *)
struct OnMyWayIntent: AppIntent, ForegroundContinuableIntent {
    static var title: LocalizedStringResource = "On my way"
    static var description = IntentDescription("Text the client of your next job that you're on your way.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let (status, data) = try await siteRequest("/api/app/siri/on-my-way", method: "POST", json: [:])
        if status == 404 { throw SiriError.noJob }
        try check(status, data)
        let reply = try JSONDecoder().decode(OnMyWayReply.self, from: data)
        // No business line: the server stamped the job and handed back the
        // text; it goes out from the phone's Messages app, as the app's button does.
        if reply.handoff == true, let phone = reply.phone, let body = reply.body {
            try await requestToContinueInForeground("Open Messages to text \(reply.client)?")
            guard await openMessages(phone: phone, body: body) else { throw SiriError.refused("Couldn't open Messages.") }
            return .result(dialog: "Your on-my-way text to \(reply.client) is ready to send in Messages.")
        }
        return .result(dialog: "Told \(reply.client) you're on your way.")
    }
}

@available(iOS 16.4, *)
struct CallBackMissedIntent: AppIntent, ForegroundContinuableIntent {
    static var title: LocalizedStringResource = "Call back last missed call"
    static var description = IntentDescription("Return the last missed call on your business line.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let (status, data) = try await siteRequest("/api/app/siri/last-missed")
        try check(status, data)
        guard let call = try JSONDecoder().decode(MissedReply.self, from: data).call else { throw SiriError.noMissed }
        let said = try await placeCall(contactId: nil, to: call.number, name: call.label, phone: call.number) {
            try await requestToContinueInForeground("Open the phone app to call \(call.label) back?")
        }
        return .result(dialog: "\(said)")
    }
}

@available(iOS 16.4, *)
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

// MARK: - Phrases (ten shortcuts: Apple's cap per app)

@available(iOS 16.4, *)
struct WorkBenchShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ClockIntent(),
            phrases: ["Clock me \(\.$direction) with \(.applicationName)", "Clock \(\.$direction) with \(.applicationName)", "Clock me \(\.$direction) in \(.applicationName)"],
            shortTitle: "Clock in or out",
            systemImageName: "clock.badge.checkmark"
        )
        AppShortcut(
            intent: OpenNextJobIntent(),
            phrases: ["Next job in \(.applicationName)", "\(\.$action) in \(.applicationName)", "\(\.$action) with \(.applicationName)"],
            shortTitle: "Next job",
            systemImageName: "wrench.and.screwdriver"
        )
        AppShortcut(
            intent: TodayIntent(),
            phrases: ["What's my day look like in \(.applicationName)", "What's on my schedule in \(.applicationName)", "What's \(\.$question) in \(.applicationName)", "Tell me \(\.$question) with \(.applicationName)"],
            shortTitle: "My day",
            systemImageName: "calendar"
        )
        AppShortcut(
            intent: CompleteJobIntent(),
            phrases: ["Complete my job in \(.applicationName)", "Mark my job complete in \(.applicationName)", "Finish my job with \(.applicationName)"],
            shortTitle: "Complete my job",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: ReachNextClientIntent(),
            phrases: ["\(\.$how) my next client with \(.applicationName)", "\(\.$how) my next client in \(.applicationName)"],
            shortTitle: "Reach my next client",
            systemImageName: "person.crop.circle.badge.checkmark"
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
    }
}
