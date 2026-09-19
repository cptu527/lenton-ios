import SwiftUI

struct ListsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var newTitle = ""
    @State private var createPrompt = false

    var body: some View {
        List {
            ForEach(session.lists) { list in
                NavigationLink(list.title) { ListTimelineView(list: list) }
            }
            .onDelete { offsets in
                Task {
                    guard let api = session.api else { return }
                    for index in offsets {
                        try? await api.deleteList(id: session.lists[index].id)
                    }
                    await session.refreshLists()
                }
            }
        }
        .navigationTitle("리스트")
        .toolbar {
            Button { createPrompt = true } label: { Image(systemName: "plus") }
        }
        .alert("새 리스트", isPresented: $createPrompt) {
            TextField("리스트 이름", text: $newTitle)
            Button("취소", role: .cancel) {}
            Button("생성") {
                Task {
                    if let api = session.api, !newTitle.trimmingCharacters(in: .whitespaces).isEmpty {
                        _ = try? await api.createList(title: newTitle)
                        newTitle = ""
                        await session.refreshLists()
                    }
                }
            }
        }
        .task { await session.refreshLists() }
    }
}

private struct ListTimelineView: View {
    @EnvironmentObject private var session: SessionStore
    let list: MastodonList
    @State private var statuses: [MastodonStatus] = []
    @State private var composerTarget: MastodonStatus?
    @State private var showComposer = false

    var body: some View {
        List(statuses) { status in
            StatusRow(rawStatus: status) { target in
                composerTarget = target
                showComposer = true
            }
            .listRowInsets(EdgeInsets())
        }
        .listStyle(.plain)
        .navigationTitle(list.title)
        .refreshable { await load() }
        .sheet(isPresented: $showComposer) {
            ComposerView(replyTo: composerTarget)
        }
        .task { await load() }
    }

    private func load() async {
        statuses = (try? await session.api?.listTimeline(id: list.id)) ?? []
    }
}
