import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var server = ""
    @State private var working = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("L")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 72, height: 72)
                .background(session.accentColor, in: Circle())
            Text("렌톤")
                .font(.largeTitle.bold())
            Text("마스토돈은 그대로, 더 편하고 예쁘게.")
                .foregroundStyle(.secondary)

            TextField("mastodon.social", text: $server)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .autocorrectionDisabled()
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                .padding(.top, 18)

            Button {
                Task { await signIn() }
            } label: {
                HStack {
                    if working { ProgressView().tint(.white) }
                    Text(working ? "로그인 준비 중…" : "Mastodon으로 로그인")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .disabled(working || server.trimmingCharacters(in: .whitespaces).isEmpty)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
            Spacer()
        }
        .padding(28)
    }

    private func signIn() async {
        working = true
        defer { working = false }
        do {
            try await session.login(server: server)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
