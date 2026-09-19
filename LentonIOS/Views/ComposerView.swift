import SwiftUI

private struct ComposerPart: Identifiable {
    let id = UUID()
    var text = ""
    var cwEnabled: Bool
    var spoiler: String
}

struct ComposerView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss

    let replyTo: MastodonStatus?
    var forcedVisibility: String? = nil

    @State private var parts: [ComposerPart]
    @State private var excludedAccounts: Set<String> = []
    @State private var posting = false
    @State private var showDiscard = false
    @State private var errorMessage: String?

    init(replyTo: MastodonStatus?, forcedVisibility: String? = nil) {
        self.replyTo = replyTo
        self.forcedVisibility = forcedVisibility
        let inherited = replyTo?.spoilerText ?? ""
        _parts = State(initialValue: [
            ComposerPart(text: "", cwEnabled: !inherited.isEmpty, spoiler: inherited)
        ])
    }

    private var recipients: [MastodonMention] {
        guard let replyTo else { return [] }
        var seen = Set<String>()
        var values: [MastodonMention] = []
        if replyTo.account.id != session.me?.id {
            let mention = MastodonMention(id: replyTo.account.id, username: replyTo.account.username, acct: replyTo.account.acct, url: replyTo.account.url)
            values.append(mention)
            seen.insert(mention.id)
        }
        for mention in replyTo.mentions where mention.id != session.me?.id && !seen.contains(mention.id) {
            values.append(mention)
            seen.insert(mention.id)
        }
        return values
    }

    private var hasDraft: Bool {
        parts.contains { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || ($0.cwEnabled && !$0.spoiler.isEmpty) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let replyTo {
                        HStack(spacing: 10) {
                            AsyncImage(url: URL(string: replyTo.account.avatar)) { image in
                                image.resizable().scaledToFill()
                            } placeholder: { Circle().fill(.quaternary) }
                            .frame(width: 38, height: 38).clipShape(Circle())
                            VStack(alignment: .leading) {
                                Text(replyTo.account.shownName).bold()
                                Text(HTMLText.plain(replyTo.content)).lineLimit(2).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }

                        if !recipients.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack {
                                    ForEach(recipients) { account in
                                        Button {
                                            if excludedAccounts.contains(account.id) { excludedAccounts.remove(account.id) }
                                            else { excludedAccounts.insert(account.id) }
                                        } label: {
                                            Text("@\(account.acct)")
                                                .strikethrough(excludedAccounts.contains(account.id))
                                        }
                                        .buttonStyle(.bordered)
                                        .buttonBorderShape(.capsule)
                                    }
                                }
                            }
                        }
                    }

                    ForEach($parts) { $part in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(parts.count > 1 ? "게시물 \((parts.firstIndex(where: { $0.id == part.id }) ?? 0) + 1)" : (replyTo == nil ? "새 게시물" : "답글"))
                                    .font(.headline)
                                Spacer()
                                Toggle("CW", isOn: $part.cwEnabled).labelsHidden()
                                Text("CW").font(.caption.bold())
                            }

                            if part.cwEnabled {
                                TextField("내용 경고", text: $part.spoiler)
                                    .textFieldStyle(.roundedBorder)
                            }

                            TextEditor(text: $part.text)
                                .frame(minHeight: 130)
                                .padding(8)
                                .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
                        }
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    }

                    Button {
                        let inherited = replyTo?.spoilerText ?? ""
                        parts.append(ComposerPart(text: "", cwEnabled: !inherited.isEmpty, spoiler: inherited))
                    } label: {
                        Label("다른 게시물 추가", systemImage: "plus.circle")
                    }
                    .buttonStyle(.bordered)
                }
                .padding()
            }
            .navigationTitle(replyTo == nil ? "새 게시물" : "답글")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(hasDraft && !posting)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") {
                        if hasDraft { showDiscard = true } else { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(posting ? "게시 중…" : "게시") { Task { await post() } }
                        .disabled(posting || parts.allSatisfy { $0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
                }
            }
            .alert("작성 중인 내용을 버릴까요?", isPresented: $showDiscard) {
                Button("취소", role: .cancel) {}
                Button("버리기", role: .destructive) { dismiss() }
            }
            .alert("게시하지 못했어요", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("확인", role: .cancel) {}
            } message: { Text(errorMessage ?? "") }
        }
    }

    private func mentionPrefix() -> String {
        recipients
            .filter { !excludedAccounts.contains($0.id) }
            .map { "@\($0.acct)" }
            .joined(separator: " ")
    }

    private func post() async {
        guard let api = session.api else { return }
        posting = true
        defer { posting = false }
        do {
            var replyID = replyTo?.id
            let prefix = mentionPrefix()
            for (index, part) in parts.enumerated() {
                let trimmed = part.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty { continue }
                let text = index == 0 && !prefix.isEmpty ? "\(prefix) \(trimmed)" : trimmed
                let posted = try await api.createStatus(
                    text: text,
                    replyTo: replyID,
                    visibility: forcedVisibility ?? replyTo?.visibility ?? "public",
                    spoilerText: part.cwEnabled ? part.spoiler.trimmingCharacters(in: .whitespacesAndNewlines) : ""
                )
                replyID = posted.id
            }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
