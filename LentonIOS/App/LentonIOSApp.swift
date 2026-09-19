import SwiftUI

@main
struct LentonIOSApp: App {
    @StateObject private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if session.isAuthenticated {
                    RootView()
                } else {
                    LoginView()
                }
            }
            .environmentObject(session)
            .tint(session.accentColor)
            .preferredColorScheme(session.preferredColorScheme)
            .task { await session.restore() }
        }
    }
}
