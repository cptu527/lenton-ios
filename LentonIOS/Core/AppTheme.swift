import SwiftUI
import UIKit

enum LentonAccent: String, CaseIterable, Identifiable {
    case blue, pink, purple, green, orange
    var id: String { rawValue }

    var color: Color {
        switch self {
        case .blue: Color(red: 29/255, green: 155/255, blue: 240/255)
        case .pink: Color(red: 249/255, green: 24/255, blue: 128/255)
        case .purple: Color(red: 120/255, green: 86/255, blue: 255/255)
        case .green: Color(red: 0/255, green: 186/255, blue: 124/255)
        case .orange: Color(red: 255/255, green: 122/255, blue: 0/255)
        }
    }

    var title: String {
        switch self {
        case .blue: "파랑"
        case .pink: "핑크"
        case .purple: "보라"
        case .green: "초록"
        case .orange: "주황"
        }
    }
}

extension Color {
    var lentonContrastingText: Color {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getRed(&r, green: &g, blue: &b, alpha: &a) else { return .white }
        let luminance = 0.299 * r + 0.587 * g + 0.114 * b
        return luminance > 0.63 ? .black : .white
    }
}
