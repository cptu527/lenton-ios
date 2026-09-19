import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        Form {
            Section("화면") {
                Picker("모드", selection: $session.appearance) {
                    Text("시스템").tag("system")
                    Text("라이트").tag("light")
                    Text("다크").tag("dark")
                }

                Picker("강조색", selection: $session.accent) {
                    ForEach(LentonAccent.allCases) { accent in
                        HStack {
                            Circle().fill(accent.color).frame(width: 14, height: 14)
                            Text(accent.title)
                        }
                        .tag(accent)
                    }
                }
            }

            Section("계정") {
                if let me = session.me {
                    LabeledContent("로그인 계정", value: "@\(me.acct)")
                }
                Button("로그아웃", role: .destructive) { session.logout() }
            }

            Section("버전") {
                LabeledContent("Lenton iOS", value: "0.25.17 (201)")
                Text("Android v0.25.17 기능을 기준으로 포팅 중입니다.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("설정")
    }
}
