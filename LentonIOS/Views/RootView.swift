import SwiftUI

enum LentonTab: Int, CaseIterable, Hashable {
    case home, notifications, messages, profile

    var title: String {
        switch self {
        case .home: "홈"
        case .notifications: "알림"
        case .messages: "DM"
        case .profile: "프로필"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .notifications: "bell"
        case .messages: "envelope"
        case .profile: "person.crop.circle"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var selection: LentonTab = .home

    var body: some View {
        TabView(selection: $selection) {
            NavigationStack { HomeView() }
                .tabItem { Label("홈", systemImage: "house") }
                .tag(LentonTab.home)

            NavigationStack { NotificationsView() }
                .tabItem { Label("알림", systemImage: "bell") }
                .tag(LentonTab.notifications)

            NavigationStack { MessagesView() }
                .tabItem { Label("DM", systemImage: "envelope") }
                .tag(LentonTab.messages)

            NavigationStack {
                if let me = session.me {
                    ProfileView(accountID: me.id, isOwn: true)
                } else {
                    ProgressView()
                }
            }
            .tabItem { Label("프로필", systemImage: "person.crop.circle") }
            .tag(LentonTab.profile)
        }
        .simultaneousGesture(
            DragGesture(minimumDistance: 45)
                .onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height) * 1.4 else { return }
                    let tabs = LentonTab.allCases
                    guard let current = tabs.firstIndex(of: selection) else { return }
                    if value.translation.width < -70, current < tabs.count - 1 {
                        withAnimation { selection = tabs[current + 1] }
                    } else if value.translation.width > 70, current > 0 {
                        withAnimation { selection = tabs[current - 1] }
                    }
                }
        )
    }
}
