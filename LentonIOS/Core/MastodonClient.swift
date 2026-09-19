import Foundation

enum MastodonAPIError: LocalizedError {
    case invalidHost
    case invalidResponse
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidHost: "서버 주소가 올바르지 않습니다."
        case .invalidResponse: "서버 응답을 읽지 못했습니다."
        case let .http(code, message): "서버 오류 \(code): \(message)"
        }
    }
}

struct MastodonClient {
    static let redirectURI = "lenton://oauth/callback"
    static let scopes = "read write follow"

    let host: String
    let token: String

    private var baseURL: URL {
        URL(string: "https://\(host)")!
    }

    static func normalize(host raw: String) throws -> String {
        var host = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        host = host.replacingOccurrences(of: "https://", with: "")
        host = host.replacingOccurrences(of: "http://", with: "")
        if let slash = host.firstIndex(of: "/") { host = String(host[..<slash]) }
        while host.hasSuffix("/") { host.removeLast() }
        guard !host.isEmpty, host.contains(".") else { throw MastodonAPIError.invalidHost }
        return host
    }

    static func register(host: String) async throws -> MastodonAppRegistration {
        try await unauthenticatedPOST(
            host: host,
            path: "/api/v1/apps",
            form: [
                "client_name": "Lenton iOS",
                "redirect_uris": redirectURI,
                "scopes": scopes,
                "website": ""
            ]
        )
    }

    static func exchangeToken(host: String, clientID: String, clientSecret: String, code: String) async throws -> MastodonToken {
        try await unauthenticatedPOST(
            host: host,
            path: "/oauth/token",
            form: [
                "grant_type": "authorization_code",
                "client_id": clientID,
                "client_secret": clientSecret,
                "redirect_uri": redirectURI,
                "scope": scopes,
                "code": code
            ]
        )
    }

    static func authorizationURL(host: String, clientID: String) -> URL {
        var c = URLComponents(string: "https://\(host)/oauth/authorize")!
        c.queryItems = [
            .init(name: "response_type", value: "code"),
            .init(name: "client_id", value: clientID),
            .init(name: "redirect_uri", value: redirectURI),
            .init(name: "scope", value: scopes)
        ]
        return c.url!
    }

    private static func unauthenticatedPOST<T: Decodable>(host: String, path: String, form: [String: String]) async throws -> T {
        guard let url = URL(string: "https://\(host)\(path)") else { throw MastodonAPIError.invalidHost }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded; charset=utf-8", forHTTPHeaderField: "Content-Type")
        req.httpBody = formBody(form)
        let (data, response) = try await URLSession.shared.data(for: req)
        try validate(data: data, response: response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func formBody(_ form: [String: String]) -> Data {
        var components = URLComponents()
        components.queryItems = form.map { URLQueryItem(name: $0.key, value: $0.value) }
        return Data((components.percentEncodedQuery ?? "").utf8)
    }

    private static func validate(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw MastodonAPIError.invalidResponse }
        guard 200..<300 ~= http.statusCode else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw MastodonAPIError.http(http.statusCode, message)
        }
    }

    private func request<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        form: [String: String]? = nil
    ) async throws -> T {
        var c = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { c.queryItems = query }
        guard let url = c.url else { throw MastodonAPIError.invalidResponse }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("Lenton-iOS/0.25.17", forHTTPHeaderField: "User-Agent")
        if let form {
            req.setValue("application/x-www-form-urlencoded; charset=utf-8", forHTTPHeaderField: "Content-Type")
            req.httpBody = Self.formBody(form)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        try Self.validate(data: data, response: response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func requestNoBody(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        form: [String: String]? = nil
    ) async throws {
        var c = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { c.queryItems = query }
        guard let url = c.url else { throw MastodonAPIError.invalidResponse }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let form {
            req.setValue("application/x-www-form-urlencoded; charset=utf-8", forHTTPHeaderField: "Content-Type")
            req.httpBody = Self.formBody(form)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        try Self.validate(data: data, response: response)
    }

    func verifyCredentials() async throws -> MastodonAccount {
        try await request("GET", "/api/v1/accounts/verify_credentials")
    }

    func timeline(publicTimeline: Bool = false, maxID: String? = nil) async throws -> [MastodonStatus] {
        var q = [URLQueryItem(name: "limit", value: "30")]
        if let maxID { q.append(.init(name: "max_id", value: maxID)) }
        return try await request("GET", publicTimeline ? "/api/v1/timelines/public" : "/api/v1/timelines/home", query: q)
    }

    func listTimeline(id: String, maxID: String? = nil) async throws -> [MastodonStatus] {
        var q = [URLQueryItem(name: "limit", value: "30")]
        if let maxID { q.append(.init(name: "max_id", value: maxID)) }
        return try await request("GET", "/api/v1/timelines/list/\(id)", query: q)
    }

    func status(id: String) async throws -> MastodonStatus {
        try await request("GET", "/api/v1/statuses/\(id)")
    }

    func statusContext(id: String) async throws -> MastodonContext {
        try await request("GET", "/api/v1/statuses/\(id)/context")
    }

    func account(id: String) async throws -> MastodonAccount {
        try await request("GET", "/api/v1/accounts/\(id)")
    }

    func accountStatuses(id: String, replies: Bool) async throws -> [MastodonStatus] {
        try await request("GET", "/api/v1/accounts/\(id)/statuses", query: [
            .init(name: "limit", value: "30"),
            .init(name: "exclude_replies", value: replies ? "false" : "true")
        ])
    }

    func relationship(id: String) async throws -> MastodonRelationship {
        let values: [MastodonRelationship] = try await request(
            "GET",
            "/api/v1/accounts/relationships",
            query: [.init(name: "id[]", value: id)]
        )
        guard let first = values.first else { throw MastodonAPIError.invalidResponse }
        return first
    }

    func relationshipAction(id: String, action: String) async throws -> MastodonRelationship {
        try await request("POST", "/api/v1/accounts/\(id)/\(action)", form: [:])
    }

    func setPrivateNote(id: String, note: String) async throws -> MastodonRelationship {
        try await request("POST", "/api/v1/accounts/\(id)/note", form: ["comment": note])
    }

    func lists() async throws -> [MastodonList] {
        try await request("GET", "/api/v1/lists")
    }

    func listsContaining(accountID: String) async throws -> [MastodonList] {
        try await request("GET", "/api/v1/accounts/\(accountID)/lists")
    }

    func createList(title: String) async throws -> MastodonList {
        try await request("POST", "/api/v1/lists", form: ["title": title])
    }

    func updateList(id: String, title: String) async throws -> MastodonList {
        try await request("PUT", "/api/v1/lists/\(id)", form: ["title": title])
    }

    func deleteList(id: String) async throws {
        try await requestNoBody("DELETE", "/api/v1/lists/\(id)")
    }

    func listMembers(id: String) async throws -> [MastodonAccount] {
        try await request("GET", "/api/v1/lists/\(id)/accounts", query: [.init(name: "limit", value: "80")])
    }

    func setListMembership(listID: String, accountID: String, add: Bool) async throws {
        try await requestNoBody(add ? "POST" : "DELETE", "/api/v1/lists/\(listID)/accounts", form: ["account_ids[]": accountID])
    }

    func conversations() async throws -> [MastodonConversation] {
        try await request("GET", "/api/v1/conversations", query: [.init(name: "limit", value: "40")])
    }

    func markConversationRead(id: String) async throws -> MastodonConversation {
        try await request("POST", "/api/v1/conversations/\(id)/read", form: [:])
    }

    func notifications() async throws -> [MastodonNotification] {
        try await request("GET", "/api/v1/notifications", query: [.init(name: "limit", value: "40")])
    }

    func createStatus(
        text: String,
        replyTo: String? = nil,
        visibility: String = "public",
        spoilerText: String = ""
    ) async throws -> MastodonStatus {
        var form = [
            "status": text,
            "visibility": visibility,
            "spoiler_text": spoilerText
        ]
        if let replyTo { form["in_reply_to_id"] = replyTo }
        return try await request("POST", "/api/v1/statuses", form: form)
    }

    func statusAction(id: String, action: String) async throws -> MastodonStatus {
        try await request("POST", "/api/v1/statuses/\(id)/\(action)", form: [:])
    }

    func report(accountID: String, statusID: String? = nil, comment: String = "") async throws {
        var form = ["account_id": accountID, "comment": comment, "forward": "false"]
        if let statusID { form["status_ids[]"] = statusID }
        let _: ReportResponse = try await request("POST", "/api/v1/reports", form: form)
    }

    private struct ReportResponse: Decodable { let id: String }
}
