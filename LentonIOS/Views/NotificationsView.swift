import SwiftUI

struct NotificationsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var notifications: [MastodonNotification] = []

    var body: some View {
        List(notifications) { item in
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    AsyncImage(url: URL(string: item.account.avatar)) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { Circle().fill(.quaternary) }
                    .frame(width: 40, height: 40).clipShape(Circle())
                    VStack(alignment: .leading) {
                        Text(item.account.shownName).bold()
                        Text(label(for: item.type)).foregroundStyle(.secondary)
                    }
                }
                if let status = item.status {
                    Text(HTMLText.plain(status.content)).lineLimit(3)
                }
            }
            .padding(.vertical, 4)
        }
        .listStyle(.plain)
        .navigationTitle("알림")
        .refreshable { await load() }
        .task { await load() }
    }

    private func label(for type: String) -> String {
        switch type {
        case "mention": "회원님을 멘션했습니다"
        case "follow": "회원님을 팔로우했습니다"
        case "favourite": "게시물을 좋아합니다"
        case "reblog": "게시물을 부스트했습니다"
        case "poll": "투표가 종료되었습니다"
        default: type
        }
    }

    private func load() async {
        notifications = (try? await session.api?.notifications()) ?? []
    }
}
