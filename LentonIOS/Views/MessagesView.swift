import SwiftUI

struct MessagesView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var conversations: [MastodonConversation] = []
    @State private var loading = false

    var body: some View {
        List(conversations) { conversation in
            NavigationLink {
                ConversationView(conversation: conversation)
            } label: {
                HStack(spacing: 12) {
                    if let account = conversation.accounts.first {
                        AsyncImage(url: URL(string: account.avatar)) { image in
                            image.resizable().scaledToFill()
                        } placeholder: { Circle().fill(.quaternary) }
                        .frame(width: 46, height: 46).clipShape(Circle())
                        VStack(alignment: .leading, spacing: 4) {
                            Text(account.shownName).bold()
                            Text(conversation.lastStatus.map { HTMLText.plain($0.content) } ?? "")
                                .lineLimit(2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if conversation.unread {
                        Circle().fill(session.accentColor).frame(width: 9, height: 9)
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("DM")
        .refreshable { await load() }
        .overlay {
            if loading && conversations.isEmpty { ProgressView() }
        }
        .task { await load() }
    }

    private func load() async {
        guard let api = session.api else { return }
        loading = true
        conversations = (try? await api.conversations()) ?? []
        loading = false
    }
}

private struct ConversationView: View {
    @EnvironmentObject private var session: SessionStore
    let conversation: MastodonConversation
    @State private var statuses: [MastodonStatus] = []
    @State private var showComposer = false

    var body: some View {
        List(statuses) { status in
            StatusRow(rawStatus: status)
                .listRowInsets(EdgeInsets())
        }
        .listStyle(.plain)
        .navigationTitle(conversation.accounts.first?.shownName ?? "DM")
        .toolbar {
            Button("답장") { showComposer = true }
        }
        .sheet(isPresented: $showComposer, onDismiss: { Task { await load() } }) {
            ComposerView(replyTo: conversation.lastStatus, forcedVisibility: "direct")
        }
        .task {
            _ = try? await session.api?.markConversationRead(id: conversation.id)
            await load()
        }
    }

    private func load() async {
        guard let api = session.api, let last = conversation.lastStatus else { return }
        if let context = try? await api.statusContext(id: last.id) {
            var all = context.ancestors
            all.append(last)
            all.append(contentsOf: context.descendants)
            statuses = all
        } else {
            statuses = [last]
        }
    }
}
