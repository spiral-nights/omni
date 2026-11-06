import {
  OmniComponentNode,
  OmniTabItem,
  OmniTabsPrimitive
} from "@omni/types";
import {
  profileStore,
  getOrCreateNoteStats,
  loadSchemaProfileCache
} from "../state/profile-store.js";
import { getProfileGradientBanner } from "../crypto/gradient.js";

export function getProfileSchema(
  view = "widget",
  profile?: Record<string, any>,
  extraState?: Record<string, any>
): OmniComponentNode {
  loadSchemaProfileCache();
  const p = profile || profileStore.currentProfileData;
  const pubkey = p?.pubkey || profileStore.currentProfilePubkey || "";
  const name =
    p?.display_name ||
    p?.displayName ||
    p?.name ||
    (pubkey ? `User ${pubkey.slice(0, 8)}` : "Nostr User");
  const about =
    p?.about ||
    (pubkey ? "Decentralized Nostr identity." : "Decentralized identity on Nostr");
  const picture = p?.picture || p?.avatar || "";
  const nip05 = p?.nip05 || "";
  const lud16 = p?.lud16 || "";
  const npub = p?.npub || (pubkey ? `npub1${pubkey.slice(0, 10)}...` : "");
  const followsCount = Array.isArray(extraState?.follows)
    ? extraState?.follows.length
    : (extraState?.followsCount ?? profileStore.schemaFollowsSet.size);
  const activeTab =
    extraState?.activeTab ||
    (view === "keys" || view === "following" || view === "edit" || view === "settings" || view === "my-profile" || view === "user-profile"
      ? (view === "settings" ? "edit" : view)
      : profileStore.currentSchemaTab);

  if (view === "compact") {
    return {
      type: "metric",
      label: "Identity",
      value: name,
      subtext: pubkey ? `${pubkey.slice(0, 8)}...` : "Active"
    };
  }

  if (view === "widget") {
    return {
      type: "card",
      title: "Active Identity",
      icon: "user",
      bannerBackground: getProfileGradientBanner(pubkey || "default"),
      children: [
        {
          type: "box",
          direction: "row",
          gap: "md",
          align: "center",
          children: [
            {
              type: "avatar",
              name,
              src: picture,
              pubkey,
              size: "md"
            },
            {
              type: "box",
              direction: "column",
              gap: "xs",
              children: [
                {
                  type: "text",
                  content: name,
                  variant: "title"
                },
                {
                  type: "text",
                  content: about,
                  variant: "caption",
                  tone: "muted",
                  truncate: true
                }
              ]
            }
          ]
        },
        {
          type: "button",
          label: "View Profile",
          variant: "secondary",
          action: {
            name: "open-profile",
            navigate: {
              pluginId: "org.omni.plugin.profile-viewer",
              view: "app"
            }
          }
        }
      ]
    };
  }

  // Full Page Application View (Tabs: My Profile, Edit Metadata, Key Custody, Following)
  const isViewingOtherUser = activeTab === "user-profile" && (extraState?.targetUser || profileStore.schemaTargetUser);
  const targetUser = extraState?.targetUser || profileStore.schemaTargetUser || {};

  const tabs: OmniTabItem[] = [
    { id: "my-profile", label: "Profile", icon: "user" },
    { id: "edit", label: "Edit", icon: "edit" },
    { id: "keys", label: "Keys", icon: "key" },
    { id: "following", label: "Following", icon: "users", badge: followsCount }
  ];
  if (isViewingOtherUser) {
    tabs.unshift({ id: "user-profile", label: targetUser.name || "User Profile", icon: "user" });
  }

  const renderSchemaNoteCard = (note: any, authorName: string, authorPubkey: string): OmniComponentNode => {
    const timeStr = note.created_at
      ? new Date(note.created_at * 1000).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
      : "Recent";
    const npubShort = authorPubkey ? `npub1${authorPubkey.slice(0, 8)}...` : "";

    const stats = getOrCreateNoteStats(note.id);
    const likesCount = note.likes !== undefined ? note.likes : stats.likes;
    const repliesCount = note.replies !== undefined ? note.replies : stats.replies;
    const repostsCount = note.reposts !== undefined ? note.reposts : stats.reposts;
    const zapsCount = note.zaps !== undefined ? note.zaps : stats.zaps;
    const isLiked = Boolean(note.liked || stats.liked);
    const isReposted = Boolean(note.reposted || stats.reposted);

    const notePayload = {
      id: note.id,
      eventId: note.id,
      note: {
        id: note.id,
        pubkey: authorPubkey,
        authorName,
        npub: npubShort,
        avatar: note.avatar,
        content: note.content || "",
        created_at: note.created_at,
        likes: likesCount || 0,
        reposts: repostsCount || 0,
        replies: repliesCount || 0,
        zaps: zapsCount || 0
      }
    };

    return {
      type: "card",
      action: { name: "view_note", payload: notePayload },
      children: [
        {
          type: "box",
          direction: "row",
          justify: "between",
          align: "center",
          children: [
            {
              type: "box",
              direction: "row",
              gap: "sm",
              align: "center",
              children: [
                {
                  type: "avatar",
                  pubkey: authorPubkey,
                  name: authorName,
                  size: "sm"
                },
                {
                  type: "box",
                  direction: "column",
                  gap: "xs",
                  children: [
                    {
                      type: "text",
                      content: authorName,
                      variant: "body",
                      tone: "primary"
                    },
                    {
                      type: "text",
                      content: npubShort ? `${timeStr} · ${npubShort}` : timeStr,
                      variant: "caption",
                      tone: "muted"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "text",
          content: note.content || "",
          variant: "body",
          action: { name: "view_note", payload: notePayload }
        },
        {
          type: "divider"
        },
        {
          type: "box",
          direction: "row",
          justify: "between",
          align: "center",
          children: [
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "reply",
              label: String(repliesCount || "0"),
              action: { name: "view_note", payload: notePayload }
            },
            {
              type: "button",
              variant: isReposted ? "secondary" : "ghost",
              size: "sm",
              icon: "repeat",
              label: String(repostsCount || "0"),
              action: { name: "repost-note", payload: { id: note.id } }
            },
            {
              type: "button",
              variant: isLiked ? "secondary" : "ghost",
              size: "sm",
              icon: "heart",
              label: String(likesCount || "0"),
              action: { name: "like-note", payload: { id: note.id } }
            },
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "zap",
              label: String(zapsCount || "0"),
              action: { name: "zap-note", payload: { id: note.id } }
            }
          ]
        }
      ]
    };
  };

  const tabsNode: OmniTabsPrimitive = {
    type: "tabs",
    key: "profile-tabs",
    activeTab,
    tabs,
    action: { name: "switch-tab" }
  };

  const children: OmniComponentNode[] = [tabsNode];

  if (activeTab === "user-profile" && isViewingOtherUser) {
    const isFollowing = extraState?.isFollowing ?? targetUser.isFollowing;
    const backTarget = profileStore.schemaPreviousTab === "blocked" ? "blocked" : (profileStore.schemaPreviousTab || "following");
    const backLabel =
      profileStore.schemaPreviousTab === "blocked"
        ? "← Back to Blocked"
        : profileStore.schemaPreviousTab === "following"
        ? "← Back to Following"
        : profileStore.schemaPreviousTab === "my-profile"
        ? "← Back to My Profile"
        : "← Back";
    children.push({
      type: "box",
      key: "user-profile-back-bar",
      direction: "row",
      justify: "between",
      align: "center",
      children: [
        {
          type: "button",
          label: backLabel,
          variant: "secondary",
          size: "sm",
          action: { name: "back", payload: { tab: backTarget, isBack: true }, navigate: { back: true } }
        }
      ]
    });

    const targetPubkey = targetUser.pubkey || "";
    const userBannerGradient = getProfileGradientBanner(targetPubkey || "default");
    children.push({
      type: "box",
      key: "user-profile-banner",
      style: `width: 100%; height: 115px; min-height: 115px; border-radius: var(--omni-radius-md, 10px); background: ${userBannerGradient}; margin-bottom: -36px; transition: background 0.25s ease;`,
      children: []
    });

    children.push({
      type: "box",
      key: "user-profile-header",
      direction: "row",
      justify: "between",
      align: "center",
      style: "margin-top: -36px; margin-bottom: 8px; z-index: 1; padding: 0 4px; flex-wrap: wrap; gap: 8px;",
      children: [
        {
          type: "box",
          direction: "row",
          gap: "md",
          align: "center",
          children: [
            {
              type: "avatar",
              name: targetUser.name || "Nostr User",
              src: targetUser.picture || "",
              pubkey: targetPubkey,
              size: "xl",
              style: "border: 3px solid var(--omni-bg-elevated, #22201d); border-radius: 50%; box-shadow: 0 4px 16px rgba(0,0,0,0.5); background: var(--omni-bg-surface, #191816); flex-shrink: 0;"
            },
            {
              type: "box",
              direction: "column",
              gap: "xs",
              children: [
                { type: "text", content: targetUser.name || "Nostr User", variant: "title" },
                { type: "text", content: targetUser.about || "Decentralized Nostr user", variant: "body", tone: "muted" }
              ]
            }
          ]
        },
        {
          type: "button",
          label: isFollowing ? "Unfollow" : "+ Follow",
          variant: isFollowing ? "secondary" : "primary",
          size: "sm",
          action: {
            name: isFollowing ? "unfollow" : "follow",
            payload: { pubkey: targetPubkey }
          }
        }
      ]
    });

    if (targetUser.nip05) {
      children.push({
        type: "box",
        key: "user-profile-nip05",
        direction: "row",
        align: "center",
        gap: "xs",
        children: [
          { type: "badge", label: targetUser.nip05, tone: "accent" }
        ]
      });
    }

    if (targetUser.pubkey) {
      children.push({
        type: "code-block",
        key: "user-profile-pubkey",
        code: targetUser.pubkey,
        language: "text"
      });
    }

    children.push({
      type: "divider",
      key: "user-profile-divider"
    });

    children.push({
      type: "text",
      key: "user-profile-posts-title",
      content: "Recent Posts",
      variant: "title"
    });

    if (profileStore.schemaUserNotes.length === 0) {
      children.push({
        type: "banner",
        key: "user-profile-no-posts",
        tone: "info",
        message: "No posts found for this user."
      });
    } else {
      for (const note of profileStore.schemaUserNotes) {
        children.push(renderSchemaNoteCard(note, targetUser.name || "User", targetUser.pubkey || note.pubkey));
      }
    }
  } else if (activeTab === "edit") {
    children.push({
      type: "banner",
      tone: "info",
      title: "Public Nostr Identity (Kind 0)",
      message: "Update your public profile. Changes will be signed with your private key in local WebCrypto custody and published to the relay pool."
    });

    children.push({
      type: "box",
      direction: "column",
      gap: "sm",
      children: [
        {
          type: "input",
          name: "name",
          placeholder: "Display Name",
          value: name
        },
        {
          type: "input",
          name: "about",
          placeholder: "Bio / About Me",
          value: about
        },
        {
          type: "input",
          name: "picture",
          placeholder: "Avatar Image URL (https://...)",
          value: picture
        },
        {
          type: "input",
          name: "nip05",
          placeholder: "NIP-05 Identifier (e.g. user@domain.com)",
          value: nip05
        },
        {
          type: "input",
          name: "lud16",
          placeholder: "Lightning Address (e.g. user@getalby.com)",
          value: lud16
        },
        {
          type: "button",
          label: "Save & Publish Profile (Kind 0)",
          variant: "primary",
          action: { name: "save-profile" }
        }
      ]
    });
  } else if (activeTab === "keys") {
    children.push({
      type: "banner",
      tone: "info",
      title: "WebCrypto Keystore Custody (NIP-07)",
      message: "Omni stores your private keys locally in hardware-isolated WebCrypto custody. Plugins and nsites never access raw keys; they sign events through standard window.nostr."
    });

    children.push({
      type: "box",
      direction: "row",
      align: "center",
      justify: "between",
      children: [
        {
          type: "metric",
          label: "Active Public Key",
          value: pubkey ? `${pubkey.slice(0, 10)}...` : "None",
          subtext: "Hardware-isolated custody"
        },
        {
          type: "status-indicator",
          status: pubkey ? "online" : "offline",
          label: pubkey ? "Keystore Active" : "No Key Active",
          pulse: !!pubkey
        }
      ]
    });

    if (pubkey) {
      children.push({
        type: "code-block",
        code: npub || pubkey,
        language: "text"
      });
    }

    children.push({
      type: "box",
      direction: "column",
      gap: "sm",
      children: [
        {
          type: "input",
          name: "keyInput",
          placeholder: "nsec1... or 64-char hex private key to switch account"
        },
        {
          type: "box",
          direction: "row",
          gap: "sm",
          children: [
            {
              type: "button",
              label: "Switch Account",
              variant: "primary",
              action: { name: "switch-key" }
            },
            {
              type: "button",
              label: "Generate New Keypair",
              variant: "secondary",
              action: { name: "generate-key" }
            }
          ]
        }
      ]
    });
  } else if (activeTab === "following") {
    children.push({
      type: "banner",
      tone: "info",
      title: "Nostr Contact Graph (Kind 3)",
      message: "Decentralized list of public keys you follow across the network."
    });

    const followsList = Array.isArray(extraState?.follows)
      ? extraState?.follows
      : Array.from(profileStore.schemaFollowsSet).map((pk) => ({ pubkey: pk }));

    if (followsList.length === 0) {
      children.push({
        type: "banner",
        tone: "info",
        message: "You are not following anyone yet."
      });
    } else {
      children.push({
        type: "virtual-list",
        itemHeight: 56,
        overscan: 6,
        items: followsList.map((f: any) => {
          const fPk = typeof f === "string" ? f : f.pubkey;
          const meta = profileStore.schemaProfileCache.get(fPk);
          const fName =
            (typeof f === "object" && f.name && f.name !== `${fPk.slice(0, 8)}...` ? f.name : null) ||
            meta?.display_name ||
            meta?.name ||
            `User ${fPk.slice(0, 8)}`;
          const fAbout = (typeof f === "object" && f.about ? f.about : null) || meta?.about || "";
          const fPic = (typeof f === "object" && (f.picture || f.avatar) ? (f.picture || f.avatar) : null) || meta?.picture || "";
          const fNip05 = (typeof f === "object" && f.nip05 ? f.nip05 : null) || meta?.nip05 || "";

          return {
            type: "list-item",
            id: fPk,
            key: fPk,
            title: fName,
            subtitle: fAbout ? (fAbout.length > 80 ? fAbout.slice(0, 80) + "..." : fAbout) : (fNip05 || `${fPk.slice(0, 16)}...`),
            meta: fNip05 || `${fPk.slice(0, 8)}...`,
            avatarPubkey: fPk,
            onClickAction: {
              name: "view_profile",
              payload: { pubkey: fPk }
            },
            actions: [
              {
                type: "button",
                label: "Unfollow",
                size: "sm",
                variant: "secondary",
                action: { name: "unfollow", payload: { pubkey: fPk } }
              }
            ]
          };
        })
      });
    }
  } else {
    // "my-profile"
    const bannerGradient = getProfileGradientBanner(pubkey || "default");
    children.push({
      type: "box",
      key: "my-profile-banner",
      style: `width: 100%; height: 115px; min-height: 115px; border-radius: var(--omni-radius-md, 10px); background: ${bannerGradient}; margin-bottom: -36px; transition: background 0.25s ease;`,
      children: []
    });

    children.push({
      type: "box",
      key: "my-profile-header",
      direction: "row",
      gap: "md",
      align: "center",
      style: "margin-top: -36px; margin-bottom: 8px; z-index: 1; padding: 0 4px;",
      children: [
        {
          type: "avatar",
          name,
          src: picture,
          pubkey,
          size: "xl",
          style: "border: 3px solid var(--omni-bg-elevated, #22201d); border-radius: 50%; box-shadow: 0 4px 16px rgba(0,0,0,0.5); background: var(--omni-bg-surface, #191816); flex-shrink: 0;"
        },
        {
          type: "box",
          direction: "column",
          gap: "xs",
          children: [
            { type: "text", content: name, variant: "title" },
            { type: "text", content: about, variant: "body", tone: "muted" }
          ]
        }
      ]
    });

    if (nip05) {
      children.push({
        type: "box",
        key: "my-profile-nip05",
        direction: "row",
        align: "center",
        gap: "xs",
        children: [
          { type: "badge", label: nip05, tone: "accent" }
        ]
      });
    }

    if (pubkey) {
      children.push({
        type: "code-block",
        key: "my-profile-pubkey",
        code: npub || pubkey,
        language: "text"
      });
    }

    children.push({
      type: "box",
      key: "my-profile-metrics",
      direction: "row",
      gap: "md",
      children: [
        {
          type: "metric",
          label: "Following",
          value: followsCount,
          subtext: "Kind 3 contacts"
        },
        {
          type: "metric",
          label: "Relay Security",
          value: "NIP-07",
          subtext: "WebCrypto Custody"
        }
      ]
    });

    children.push({
      type: "box",
      key: "my-profile-actions",
      direction: "row",
      gap: "sm",
      children: [
        {
          type: "button",
          label: "Edit Profile",
          variant: "primary",
          action: { name: "switch-tab", payload: { tab: "edit" } }
        },
        {
          type: "button",
          label: "Key Custody",
          variant: "secondary",
          action: { name: "switch-tab", payload: { tab: "keys" } }
        }
      ]
    });

    if (profileStore.schemaUserNotes.length > 0) {
      children.push({
        type: "divider",
        key: "my-profile-divider"
      });
      children.push({
        type: "text",
        key: "my-profile-posts-title",
        content: "Recent Posts",
        variant: "title"
      });
      for (const note of profileStore.schemaUserNotes) {
        children.push(renderSchemaNoteCard(note, name || "You", pubkey || note.pubkey));
      }
    }
  }

  const pageDeclaration =
    activeTab === "user-profile" && isViewingOtherUser
      ? {
          id: `user-profile:${targetUser.pubkey}`,
          title: targetUser.name || "User Profile",
          url: `?view=user-profile&pubkey=${targetUser.pubkey}`,
          state: { tab: "user-profile", pubkey: targetUser.pubkey }
        }
      : activeTab === "my-profile"
      ? {
          id: "my-profile",
          title: "My Profile",
          url: "",
          state: null
        }
      : {
          id: activeTab,
          title: activeTab.charAt(0).toUpperCase() + activeTab.slice(1),
          url: `?tab=${activeTab}`,
          state: { tab: activeTab }
        };

  return {
    type: "card",
    title: "Profiles & Key Custody",
    subtitle: "Decentralized Nostr identity and custody manager",
    icon: "users",
    page: pageDeclaration,
    children
  };
}
