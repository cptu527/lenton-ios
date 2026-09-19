import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var publicTimeline = false
    @State private var selectedList: MastodonList?
    @State private var statuses: [MastodonStatus] = []
    @State private var loading = false
    @State private var errorMessage: String?
    @State private var composerTarget: MastodonStatus?
    @State private var showComposer = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("타임라인", selection: $publicTimeline) {
                Text("시간순").tag(false)
                Text("퍼블릭").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .onChange(of: publicTimeline) { _, _ in
                selectedList = nil
                Task { await load() }
            }

            if !session.lists.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(session.lists) { list in
                            Button(list.title) {
                                selectedList = selectedList?.id == list.id ? nil : list
                                Task { await load() }
                            }
                            .buttonStyle(.bordered)
                            .buttonBorderShape(.capsule)
                            .tint(selectedList?.id == list.id ? session.accentColor : .secondary)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 7)
                }
            }

            Divider().overlay(session.accentColor.opacity(0.35))

            if loading && statuses.isEmpty {
                Spacer()
                ProgressView()
                Spacer()
            } else if let errorMessage, statuses.isEmpty {
                ContentUnavailableView(
                    "타임라인을 불러오지 못했어요",
                    systemImage: "exclamationmark.triangle",
                    description: Text(errorMessage)
                )
            } else {
                List {
                    ForEach(statuses) { status in
                        StatusRow(rawStatus: status) { target in
                            composerTarget = target
                            showComposer = true
                        }
                        .listRowInsets(EdgeInsets())
                    }
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
        .navigationTitle(selectedList?.title ?? "홈")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink { ListsView() } label: { Image(systemName: "list.bullet") }
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { SettingsView() } label: { Image(systemName: "gearshape") }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            Button {
                composerTarget = nil
                showComposer = true
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .frame(width: 60, height: 60)
                    .background(session.accentColor, in: RoundedRectangle(cornerRadius: 18))
                    .shadow(radius: 5)
            }
            .padding(20)
        }
        .gesture(
            DragGesture(minimumDistance: 35)
                .onEnded { value in
                    guard selectedList == nil,
                          abs(value.translation.width) > abs(value.translation.height) * 1.5,
                          abs(value.translation.width) > 80 else { return }
                    publicTimeline = value.translation.width < 0
                    Task { await load() }
                }
        )
        .sheet(isPresented: $showComposer, onDismiss: {
            composerTarget = nil
            Task { await load() }
        }) {
            ComposerView(replyTo: composerTarget)
        }
        .task {
            await session.refreshLists()
            await load()
        }
    }

    private func load() async {
        guard let api = session.api else { return }
        loading = true
        defer { loading = false }
        do {
            if let selectedList {
                statuses = try await api.listTimeline(id: selectedList.id)
            } else {
                statuses = try await api.timeline(publicTimeline: publicTimeline)
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
