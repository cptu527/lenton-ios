import Foundation

struct MastodonAccount: Codable, Identifiable, Hashable {
    let id: String
    let username: String
    let acct: String
    let displayName: String
    let note: String
    let url: String
    let avatar: String
    let header: String
    let locked: Bool?
    let followersCount: Int
    let followingCount: Int
    let statusesCount: Int

    enum CodingKeys: String, CodingKey {
        case id, username, acct, note, url, avatar, header, locked
        case displayName = "display_name"
        case followersCount = "followers_count"
        case followingCount = "following_count"
        case statusesCount = "statuses_count"
    }

    var shownName: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? username : displayName
    }
}

struct MastodonMention: Codable, Hashable, Identifiable {
    let id: String
    let username: String
    let acct: String
    let url: String
}

struct MastodonMedia: Codable, Hashable, Identifiable {
    let id: String
    let type: String
    let url: String?
    let previewURL: String?
    let description: String?

    enum CodingKeys: String, CodingKey {
        case id, type, url, description
        case previewURL = "preview_url"
    }
}

final class MastodonStatus: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: String
    let inReplyToID: String?
    let content: String
    let spoilerText: String
    let visibility: String
    let account: MastodonAccount
    let mentions: [MastodonMention]
    let mediaAttachments: [MastodonMedia]
    let repliesCount: Int
    let reblogsCount: Int
    let favouritesCount: Int
    let favourited: Bool?
    let reblogged: Bool?
    let bookmarked: Bool?
    let reblog: MastodonStatus?

    enum CodingKeys: String, CodingKey {
        case id, content, visibility, account, mentions, favourited, reblogged, bookmarked, reblog
        case createdAt = "created_at"
        case inReplyToID = "in_reply_to_id"
        case spoilerText = "spoiler_text"
        case mediaAttachments = "media_attachments"
        case repliesCount = "replies_count"
        case reblogsCount = "reblogs_count"
        case favouritesCount = "favourites_count"
    }

    var displayedStatus: MastodonStatus { reblog ?? self }

    static func == (lhs: MastodonStatus, rhs: MastodonStatus) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct MastodonRelationship: Codable {
    let id: String
    let following: Bool?
    let followedBy: Bool?
    let muting: Bool?
    let blocking: Bool?
    let note: String?

    enum CodingKeys: String, CodingKey {
        case id, following, muting, blocking, note
        case followedBy = "followed_by"
    }
}

struct MastodonList: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let repliesPolicy: String?
    let exclusive: Bool?

    enum CodingKeys: String, CodingKey {
        case id, title, exclusive
        case repliesPolicy = "replies_policy"
    }
}

struct MastodonConversation: Codable, Identifiable {
    let id: String
    let unread: Bool
    let accounts: [MastodonAccount]
    let lastStatus: MastodonStatus?

    enum CodingKeys: String, CodingKey {
        case id, unread, accounts
        case lastStatus = "last_status"
    }
}

struct MastodonNotification: Codable, Identifiable {
    let id: String
    let type: String
    let createdAt: String
    let account: MastodonAccount
    let status: MastodonStatus?

    enum CodingKeys: String, CodingKey {
        case id, type, account, status
        case createdAt = "created_at"
    }
}

struct MastodonContext: Codable {
    let ancestors: [MastodonStatus]
    let descendants: [MastodonStatus]
}

struct MastodonAppRegistration: Codable {
    let id: String
    let clientID: String
    let clientSecret: String

    enum CodingKeys: String, CodingKey {
        case id
        case clientID = "client_id"
        case clientSecret = "client_secret"
    }
}

struct MastodonToken: Codable {
    let accessToken: String
    enum CodingKeys: String, CodingKey { case accessToken = "access_token" }
}

enum HTMLText {
    static func plain(_ html: String) -> String {
        guard let data = html.data(using: .utf8),
              let text = try? NSAttributedString(
                data: data,
                options: [
                    .documentType: NSAttributedString.DocumentType.html,
                    .characterEncoding: String.Encoding.utf8.rawValue
                ],
                documentAttributes: nil
              ).string else { return html }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
