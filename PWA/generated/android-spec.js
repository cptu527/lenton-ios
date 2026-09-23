window.LENTON_ANDROID_SPEC = {
  "schema": 1,
  "generatedFrom": "published-android-apk",
  "versionCode": 267,
  "versionName": "0.25.83",
  "apkUrl": "https://raw.githubusercontent.com/cptu527/lenton-updates/main/Lenton-v0.25.83-test.apk",
  "apkSha256": "8d62d78b370755ea226356af1802c753945e3b16557f23817e874b209968710c",
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
      "targetInitialItems": 30,
      "maxHomeScans": 6,
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
    "activity": "8cb6b92afce637e0052613b6b9a72cb881d6d838f15f878af093a61a2644e9ae",
    "publicFilter": "de8d4cd01e5c5ee6a8080c67b280796c4ec6ca8c6a7ac26f9fe8fc2ec139f16e",
    "publicLoader": null,
    "bottomNav": "9f473b9ab373088e62c2590c0ebb9598987d995588c471ba360db46bdc67bcf7",
    "drawer": "9e2eb01400c9b2f7c875dced8b09232118ffd49095021f7d71340795a4451db3",
    "composer": "90e01f3b6ba3a012dda437c110b94d484006ce57cf1e8d084a384aafaaa95f2c",
    "topBar": "2650c989565e09c586a7a750e65e74b6b6930f40a9cc0da19e8038da4861f5b2",
    "status": null,
    "profile": "21eb18438961cb5e309d2f0b13552eb12e0d6b277fae0219db177e0c42d55daa",
    "notification": null,
    "conversation": "d20ff085d7425bc2b99c1575460660a28355630c4f7978852dfe5d16075daf2c"
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
