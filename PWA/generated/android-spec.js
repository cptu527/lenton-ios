window.LENTON_ANDROID_SPEC = {
  "schema": 1,
  "generatedFrom": "published-android-apk",
  "versionCode": 307,
  "versionName": "0.28.03",
  "apkUrl": "https://raw.githubusercontent.com/cptu527/lenton-updates/main/Lenton-v0.28.03-test.apk",
  "apkSha256": "1c9655ef45c0d0c42088ffc9198fb9e4315c80a36237a46b81dd077704c75846",
  "decompiledSource": "com/mastoflow/app/MainActivity.java",
  "homeTabs": {
    "chronological": "시간순",
    "public": "퍼블릭"
  },
  "bottomNav": {
    "order": [
      "home",
      "search",
      "notifications",
      "dm"
    ]
  },
  "timeline": {
    "public": {
      "targetInitialItems": 40,
      "maxHomeScans": 7,
      "progressiveScans": 24,
      "olderTargetItems": 20,
      "olderMaxScans": 6,
      "excludeDirect": false,
      "excludeBoosts": false,
      "excludeReplies": true,
      "excludeOwnPosts": true,
      "homeSourceTrusted": true
    }
  },
  "theme": {
    "accent": "#1d9bf0",
    "light": {
      "bg": "#ffffff",
      "surface": "#f7f9f9",
      "fg": "#0f1419",
      "sub": "#536471",
      "line": "#eff3f4"
    },
    "dark": {
      "bg": "#151a1e",
      "surface": "#1d2429",
      "fg": "#e1e6e9",
      "sub": "#9da8ae",
      "line": "#30383d"
    }
  },
  "ui": {
    "topBarDp": 50,
    "bottomBarDp": 58,
    "topBarPadding": [
      16,
      0,
      8,
      0
    ],
    "topBarAvatarDp": 30,
    "topBarTitleSp": 20,
    "topBarSearchDp": 48,
    "topBarMoreDp": 44,
    "statusPadding": [
      16,
      10,
      14,
      8
    ],
    "avatarDp": 46,
    "statusContentInsetDp": 12,
    "authorLineDp": 28,
    "bodySp": 16,
    "bodyLineExtraDp": 2,
    "actionRowDp": 48,
    "actionGlyphSp": 22,
    "actionItemDp": 46,
    "mediaSingleDp": 260,
    "mediaMultiDp": 220,
    "drawerWidthRatio": 0.88,
    "drawerPadding": [
      22,
      18,
      18,
      12
    ],
    "drawerAvatarDp": 60,
    "drawerRowDp": 58,
    "drawerGlyphDp": 25,
    "drawerTextSp": 19,
    "profileHeaderDp": 170,
    "profileAvatarDp": 82,
    "profileAvatarLeftDp": 18,
    "profileAvatarTopDp": 126,
    "profileHeroDp": 226,
    "profileNameSp": 22,
    "profileTabDp": 50,
    "notificationPadding": [
      16,
      12,
      14,
      10
    ],
    "notificationGlyphDp": 25,
    "messagePadding": [
      12,
      7,
      12,
      7
    ],
    "messageAvatarDp": 46,
    "standaloneTopDp": 60
  },
  "renderer": {
    "bottomNavItems": [
      {
        "id": "home",
        "androidPage": "home",
        "glyph": "⌂"
      },
      {
        "id": "search",
        "androidPage": "search",
        "glyph": "⌕"
      },
      {
        "id": "notifications",
        "androidPage": "notifications",
        "glyph": "♢"
      },
      {
        "id": "dm",
        "androidPage": "messages",
        "glyph": "✉"
      }
    ],
    "drawerRows": [
      {
        "id": "profile",
        "label": "프로필"
      },
      {
        "id": "profileedit",
        "label": "프로필 편집"
      },
      {
        "id": "favourites",
        "label": "좋아요"
      },
      {
        "id": "bookmarks",
        "label": "북마크"
      },
      {
        "id": "followrequests",
        "label": "팔로우 요청"
      },
      {
        "id": "공지사항",
        "label": "공지사항"
      },
      {
        "id": "예약 게시물",
        "label": "예약 게시물"
      },
      {
        "id": "layoutedit",
        "label": "화면 구성 편집"
      },
      {
        "id": "realtime",
        "label": "실시간 연결 상태 표시 설정"
      },
      {
        "id": "settings",
        "label": "설정"
      },
      {
        "id": "update",
        "label": "앱 업데이트"
      }
    ],
    "actions": {
      "reply": "○",
      "boost": "↻",
      "favouriteOff": "♡",
      "favouriteOn": "♥",
      "bookmarkOff": "▢",
      "bookmarkOn": "▣"
    },
    "profileTabs": [
      "게시물"
    ],
    "profileCounts": [
      "statuses",
      "following",
      "followers"
    ],
    "notificationTabs": [
      "전체",
      "멘션"
    ],
    "notificationLabels": {
      "mention": "나를 멘션했어요",
      "favourite": "내 게시물을 좋아해요",
      "reblog": "내 게시물을 부스트했어요",
      "follow": "나를 팔로우했어요",
      "follow_request": "팔로우를 요청했어요",
      "poll": "투표가 종료됐어요",
      "status": "새 게시물을 올렸어요"
    },
    "notificationGlyphs": {
      "mention": "@",
      "favourite": "♥",
      "reblog": "↻",
      "follow": "+",
      "follow_request": "+",
      "default": "♢"
    },
    "compose": {
      "newTitle": "새 게시물",
      "replyTitle": "답글",
      "postButton": "게시",
      "replyButton": "답글",
      "cw": "CW",
      "hasPhoto": true,
      "hasCamera": true,
      "hasGif": true,
      "hasPoll": true,
      "hasThread": true,
      "toolOrder": [
        "photo",
        "camera",
        "gif",
        "poll",
        "cw",
        "plus"
      ]
    }
  },
  "features": {
    "lists": true,
    "profileOverflow": true,
    "privateProfileNote": true,
    "screenLayoutEditor": true,
    "replyCwInheritance": true,
    "bottomNavSwipe": true,
    "homeSwipe": true,
    "dmPreviousConversation": true,
    "dmThreadSeparation": true,
    "problemReport": true,
    "customEmoji": true,
    "multiAccount": true,
    "updater": true,
    "draftGuard": true
  },
  "criticalSourceHashes": {
    "activity": "b90f8ddb46fa1b8a0a2c100383c3e5388cb476a4c57681df6943c9ad07b979ef",
    "publicFilter": "de8d4cd01e5c5ee6a8080c67b280796c4ec6ca8c6a7ac26f9fe8fc2ec139f16e",
    "publicLoader": null,
    "bottomNav": "f6a455453e0a7cad308c5584567db76aa7bc10efb450062541772e1c28dfd105",
    "drawer": "2f43e2dadc7f2fae8c62eaf487b58d018d6ae0076a7c4448440e4fc6385cf64d",
    "composer": "90e01f3b6ba3a012dda437c110b94d484006ce57cf1e8d084a384aafaaa95f2c",
    "topBar": "f3e8bafb6be137008db1c7e39f986ac90dd6c31db4aa338e070185973df8860c",
    "status": null,
    "profile": "f3553dda3df731fb97504cfd1e888002ee502bfff730843b65a4cb7662075945",
    "notification": null,
    "conversation": "f19d17a7e57e22282a8a5d2e18d4d0652e1136b9fa70ead6b53234a3171b3b07"
  },
  "apkMarkerPresence": {
    "시간순": true,
    "퍼블릭": true,
    "화면 구성 편집": true,
    "프로필 편집": true,
    "비밀 메모": true,
    "답장할멘션": false,
    "게시물": true,
    "답글": true,
    "전체": true,
    "멘션": true,
    "알림 지우기": true,
    "팔로잉": true,
    "팔로워": true,
    "게시물과 답글": false,
    "고정": true,
    "미디어": true,
    "GIF": true,
    "CW": true,
    "타래": true,
    "이전 대화 보기": true,
    "문의 유형": true,
    "이메일로 보내기": true,
    "계정 추가": true,
    "앱 업데이트": true,
    "업데이트 내역": false,
    "HomeSwipeRecyclerView": true,
    "positionHomeIndicator": true,
    "renderProfile": true,
    "loadNotifications": true,
    "MainNavIconView": false,
    "StatusActionIconView": false,
    "DrawerIconView": false,
    "ComposerToolView": true,
    "/api/v1/conversations": true,
    "새 DM": false,
    "DM 보내기": false,
    "메시지 보내기": true,
    "showConversation": false,
    "loadMessages": true,
    "private void renderProfile": true,
    "private void loadMessages": true,
    "private void addConversation": true,
    "private void showConversation": false,
    "private void showOwnProfile": true,
    "private void loadNotifications": true,
    "private void openDrawer": false,
    "private void drawerRow": true,
    "StatusAction": false,
    "DrawerIcon": false,
    "MainNavIcon": false,
    "onDraw(Canvas": true,
    "addAction(": true,
    "알림": true,
    "프로필": true
  }
};
