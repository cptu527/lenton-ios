import SwiftUI

struct StatusRow: View {
    @EnvironmentObject private var session: SessionStore
    let rawStatus: MastodonStatus
    var onReply: ((MastodonStatus) -> Void)?

    private var status: MastodonStatus { rawStatus.displayedStatus }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if rawStatus.reblog != nil {
                Label("\(rawStatus.account.shownName)님이 부스트", systemImage: "arrow.2.squarepath")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 54)
            }

            HStack(alignment: .top, spacing: 11) {
                NavigationLink {
                    ProfileView(accountID: status.account.id)
                } label: {
                    AsyncImage(url: URL(string: status.account.avatar)) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Circle().fill(.quaternary)
                    }
                    .frame(width: 46, height: 46)
                    .clipShape(Circle())
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 5) {
                        Text(status.account.shownName).bold().lineLimit(1)
                        Text("@\(status.account.acct)").foregroundStyle(.secondary).lineLimit(1)
                    }
                    .font(.subheadline)

                    if !status.spoilerText.isEmpty {
                        Text(status.spoilerText)
                            .font(.subheadline.bold())
                            .padding(.vertical, 5)
                    }

                    Text(HTMLText.plain(status.content))
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if let media = status.mediaAttachments.first,
                       let preview = media.previewURL,
                       let url = URL(string: preview) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            RoundedRectangle(cornerRadius: 14).fill(.quaternary)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    HStack {
                        action("arrowshape.turn.up.left", count: status.repliesCount) {
                            onReply?(status)
                        }
                        action("arrow.2.squarepath", count: status.reblogsCount) {
                            Task { _ = try? await session.api?.statusAction(id: status.id, action: status.reblogged == true ? "unreblog" : "reblog") }
                        }
                        action(status.favourited == true ? "heart.fill" : "heart", count: status.favouritesCount) {
                            Task { _ = try? await session.api?.statusAction(id: status.id, action: status.favourited == true ? "unfavourite" : "favourite") }
                        }
                        action(status.bookmarked == true ? "bookmark.fill" : "bookmark", count: nil) {
                            Task { _ = try? await session.api?.statusAction(id: status.id, action: status.bookmarked == true ? "unbookmark" : "bookmark") }
                        }
                    }
                    .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func action(_ symbol: String, count: Int?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: symbol)
                if let count, count > 0 { Text("\(count)").font(.caption) }
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
