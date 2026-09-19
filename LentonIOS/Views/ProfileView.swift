import SwiftUI
import UIKit

struct ProfileView: View {
    @EnvironmentObject private var session: SessionStore
    let accountID: String
    var isOwn: Bool = false

    @State private var account: MastodonAccount?
    @State private var relationship: MastodonRelationship?
    @State private var statuses: [MastodonStatus] = []
    @State private var replies = false
    @State private var loading = false
    @State private var privateNote = ""
    @State private var editNote = false
    @State private var manageLists = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let account {
                ScrollView {
                    VStack(spacing: 0) {
                        ZStack(alignment: .bottomLeading) {
                            AsyncImage(url: URL(string: account.header)) { image in
                                image.resizable().scaledToFill()
                            } placeholder: { Rectangle().fill(.quaternary) }
                            .frame(height: 170).clipped()

                            AsyncImage(url: URL(string: account.avatar)) { image in
                                image.resizable().scaledToFill()
                            } placeholder: { Circle().fill(.quaternary) }
                            .frame(width: 92, height: 92)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(.background, lineWidth: 4))
                            .offset(x: 18, y: 42)
                        }
                        .padding(.bottom, 48)

                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(account.shownName).font(.title2.bold())
                                    Text("@\(account.acct)").foregroundStyle(.secondary)
                                }
                                Spacer()
                                if !isOwn {
                                    Button(relationship?.following == true ? "팔로우 해제" : "팔로우") {
                                        Task { await toggleFollow() }
                                    }
                                    .buttonStyle(.borderedProminent)
                                }
                            }

                            Text(HTMLText.plain(account.note))

                            if !isOwn {
                                Button { editNote = true } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("비밀 메모").font(.caption.bold())
                                        Text(privateNote.isEmpty ? "메모를 추가하려면 탭하세요." : privateNote)
                                            .font(.subheadline)
                                    }
                                    .foregroundStyle(session.accentColor.lentonContrastingText)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(13)
                                    .background(session.accentColor, in: RoundedRectangle(cornerRadius: 13))
                                }
                                .buttonStyle(.plain)
                            }

                            HStack {
                                Text("\(account.statusesCount) 게시물")
                                Spacer()
                                Text("\(account.followingCount) 팔로잉")
                                Spacer()
                                Text("\(account.followersCount) 팔로워")
                            }
                            .font(.subheadline.bold())
                        }
                        .padding(.horizontal, 16)

                        Picker("프로필 게시물", selection: $replies) {
                            Text("게시물").tag(false)
                            Text("게시물과 답글").tag(true)
                        }
                        .pickerStyle(.segmented)
                        .padding()
                        .onChange(of: replies) { _, _ in Task { await loadStatuses() } }

                        LazyVStack(spacing: 0) {
                            ForEach(statuses) { status in
                                Divider()
                                StatusRow(rawStatus: status)
                            }
                        }
                    }
                }
                .refreshable { await load() }
                .navigationTitle("프로필")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if !isOwn {
                        ToolbarItem(placement: .topBarTrailing) {
                            Menu {
                                Button("리스트 관리") { manageLists = true }
                                Button(relationship?.muting == true ? "뮤트 해제" : "뮤트") {
                                    Task { await relationshipAction(relationship?.muting == true ? "unmute" : "mute") }
                                }
                                Button(relationship?.blocking == true ? "차단 해제" : "차단", role: relationship?.blocking == true ? nil : .destructive) {
                                    Task { await relationshipAction(relationship?.blocking == true ? "unblock" : "block") }
                                }
                                Button("신고", role: .destructive) {
                                    Task { try? await session.api?.report(accountID: account.id) }
                                }
                                Button("프로필 링크 복사") {
                                    UIPasteboard.general.string = account.url
                                }
                            } label: {
                                Image(systemName: "ellipsis")
                                    .frame(width: 44, height: 44)
                            }
                        }
                    }
                }
                .sheet(isPresented: $editNote) {
                    PrivateNoteEditor(value: $privateNote) { value in
                        guard let api = session.api else { return }
                        relationship = try await api.setPrivateNote(id: account.id, note: value)
                        privateNote = relationship?.note ?? value
                    }
                }
                .sheet(isPresented: $manageLists) {
                    ProfileListManager(account: account)
                }
            } else if loading {
                ProgressView()
            } else {
                ContentUnavailableView("프로필을 불러오지 못했어요", systemImage: "person.crop.circle.badge.exclamationmark", description: Text(errorMessage ?? ""))
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let api = session.api else { return }
        loading = true
        defer { loading = false }
        do {
            async let a = api.account(id: accountID)
            async let s = api.accountStatuses(id: accountID, replies: replies)
            account = try await a
            statuses = try await s
            if !isOwn {
                relationship = try await api.relationship(id: accountID)
                privateNote = relationship?.note ?? ""
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadStatuses() async {
        guard let api = session.api else { return }
        statuses = (try? await api.accountStatuses(id: accountID, replies: replies)) ?? statuses
    }

    private func toggleFollow() async {
        await relationshipAction(relationship?.following == true ? "unfollow" : "follow")
    }

    private func relationshipAction(_ action: String) async {
        relationship = try? await session.api?.relationshipAction(id: accountID, action: action)
    }
}

private struct PrivateNoteEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var value: String
    let save: (String) async throws -> Void
    @State private var draft = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("상대방에게는 보이지 않습니다. 비워서 저장하면 메모가 삭제됩니다.")
                    .font(.footnote).foregroundStyle(.secondary)
                TextEditor(text: $draft)
                    .padding(10)
                    .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
                Spacer()
            }
            .padding()
            .navigationTitle("비밀 메모")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(working ? "저장 중…" : "저장") {
                        Task {
                            working = true
                            do {
                                try await save(draft.trimmingCharacters(in: .whitespacesAndNewlines))
                                value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                                dismiss()
                            } catch { self.error = error.localizedDescription }
                            working = false
                        }
                    }.disabled(working)
                }
            }
            .onAppear { draft = value }
            .alert("저장하지 못했어요", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("확인") {}
            } message: { Text(error ?? "") }
        }
    }
}

private struct ProfileListManager: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    let account: MastodonAccount
    @State private var membership = Set<String>()
    @State private var working = Set<String>()

    var body: some View {
        NavigationStack {
            List(session.lists) { list in
                Button {
                    Task { await toggle(list) }
                } label: {
                    HStack {
                        Text(list.title)
                        Spacer()
                        if working.contains(list.id) { ProgressView() }
                        else if membership.contains(list.id) { Image(systemName: "checkmark").foregroundStyle(session.accentColor) }
                    }
                }
            }
            .navigationTitle("리스트 관리")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { dismiss() } } }
            .task {
                await session.refreshLists()
                if let contained = try? await session.api?.listsContaining(accountID: account.id) {
                    membership = Set(contained.map(\.id))
                }
            }
        }
    }

    private func toggle(_ list: MastodonList) async {
        guard let api = session.api else { return }
        working.insert(list.id)
        let add = !membership.contains(list.id)
        do {
            try await api.setListMembership(listID: list.id, accountID: account.id, add: add)
            if add { membership.insert(list.id) } else { membership.remove(list.id) }
        } catch {}
        working.remove(list.id)
    }
}
