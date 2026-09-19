import SwiftUI
import AuthenticationServices
import UIKit

@MainActor
final class SessionStore: NSObject, ObservableObject {
    @Published private(set) var isAuthenticated = false
    @Published private(set) var me: MastodonAccount?
    @Published private(set) var api: MastodonClient?
    @Published var lists: [MastodonList] = []
    @Published var accent: LentonAccent = .blue {
        didSet { UserDefaults.standard.set(accent.rawValue, forKey: "lenton_accent") }
    }
    @Published var appearance: String = "system" {
        didSet { UserDefaults.standard.set(appearance, forKey: "lenton_appearance") }
    }

    private var webAuthSession: ASWebAuthenticationSession?

    override init() {
        if let saved = UserDefaults.standard.string(forKey: "lenton_accent"),
           let value = LentonAccent(rawValue: saved) { accent = value }
        appearance = UserDefaults.standard.string(forKey: "lenton_appearance") ?? "system"
        super.init()
    }

    var accentColor: Color { accent.color }
    var preferredColorScheme: ColorScheme? {
        switch appearance {
        case "dark": .dark
        case "light": .light
        default: nil
        }
    }

    func restore() async {
        guard let host = KeychainStore.get("host"),
              let token = KeychainStore.get("token") else { return }
        let client = MastodonClient(host: host, token: token)
        do {
            let account = try await client.verifyCredentials()
            api = client
            me = account
            isAuthenticated = true
            await refreshLists()
        } catch {
            KeychainStore.clearSession()
        }
    }

    func login(server raw: String) async throws {
        let host = try MastodonClient.normalize(host: raw)
        let registration = try await MastodonClient.register(host: host)
        let authURL = MastodonClient.authorizationURL(host: host, clientID: registration.clientID)
        let callbackURL = try await authenticate(url: authURL)
        guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw MastodonAPIError.invalidResponse
        }
        let tokenResponse = try await MastodonClient.exchangeToken(
            host: host,
            clientID: registration.clientID,
            clientSecret: registration.clientSecret,
            code: code
        )
        let client = MastodonClient(host: host, token: tokenResponse.accessToken)
        let account = try await client.verifyCredentials()

        KeychainStore.set(host, for: "host")
        KeychainStore.set(tokenResponse.accessToken, for: "token")
        KeychainStore.set(registration.clientID, for: "client_id")
        KeychainStore.set(registration.clientSecret, for: "client_secret")

        api = client
        me = account
        isAuthenticated = true
        await refreshLists()
    }

    private func authenticate(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "lenton") { url, error in
                if let error { continuation.resume(throwing: error); return }
                guard let url else {
                    continuation.resume(throwing: MastodonAPIError.invalidResponse)
                    return
                }
                continuation.resume(returning: url)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            webAuthSession = session
            if !session.start() {
                continuation.resume(throwing: MastodonAPIError.invalidResponse)
            }
        }
    }

    func refreshMe() async {
        guard let api else { return }
        me = try? await api.verifyCredentials()
    }

    func refreshLists() async {
        guard let api else { return }
        lists = (try? await api.lists()) ?? []
    }

    func logout() {
        KeychainStore.clearSession()
        api = nil
        me = nil
        lists = []
        isAuthenticated = false
    }
}

extension SessionStore: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}
