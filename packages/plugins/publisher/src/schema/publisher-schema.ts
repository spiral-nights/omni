import { OmniComponentNode } from "@omni/types";
import { PublisherState } from "../types.js";
import { publisherStore, getPublisherState } from "../state/publisher-store.js";

export function getPublisherSchema(
  tab = publisherStore.activeTab,
  customState?: Partial<PublisherState>
): OmniComponentNode {
  const currentTab = customState?.activeTab || tab;
  const currServers = customState?.servers || publisherStore.servers;
  const currPublished = customState?.publishedApps || publisherStore.publishedApps;
  const currExtracted = customState?.extractedFiles || publisherStore.extractedFiles;
  const currEntry = customState?.entryFilePath || publisherStore.entryFilePath;
  const currName = customState?.appName !== undefined ? customState.appName : publisherStore.appName;
  const currId = customState?.appId !== undefined ? customState.appId : publisherStore.appId;
  const currVer = customState?.appVersion !== undefined ? customState.appVersion : publisherStore.appVersion;
  const currDesc = customState?.appDescription !== undefined ? customState.appDescription : publisherStore.appDescription;
  const currPackMode = customState?.packagingMode || publisherStore.packagingMode;
  const currUrlVal = customState?.remoteUrlInputVal !== undefined ? customState.remoteUrlInputVal : publisherStore.remoteUrlInputVal;
  const currNewSrv = customState?.newServerUrlVal !== undefined ? customState.newServerUrlVal : publisherStore.newServerUrlVal;
  const currLogs = customState?.statusLogs || publisherStore.statusLogs;
  const currResult = customState?.lastPublishedResult !== undefined ? customState.lastPublishedResult : publisherStore.lastPublishedResult;
  const currProgress = customState?.uploadProgress !== undefined ? customState.uploadProgress : publisherStore.uploadProgress;

  const headerCard: OmniComponentNode = {
    type: "card",
    title: "Plugin Publisher",
    subtitle: "Package .zip archives into NIP-5A nsites, upload to Blossom servers, or install directly.",
    icon: "package",
    children: [
      {
        type: "tabs",
        activeTab: currentTab,
        action: { name: "switch-tab" },
        tabs: [
          { id: "create", label: "Create & Upload", icon: "upload" },
          { id: "published", label: `My Published Plugins (${currPublished.length})`, icon: "globe" },
          { id: "servers", label: `Blossom Servers (${currServers.filter((s) => s.enabled).length})`, icon: "server" }
        ]
      }
    ]
  };

  const contentChildren: OmniComponentNode[] = [];

  // --------------------------------------------------------------------------
  // TAB 1: CREATE & UPLOAD
  // --------------------------------------------------------------------------
  if (currentTab === "create") {
    // 1. Dropzone / File selection Card
    contentChildren.push({
      type: "card",
      title: "Drop or Select a Plugin Archive (.zip) or HTML/JS Bundle",
      subtitle: "Extracts all files in-browser, computes SHA-256 hashes, and packages your app for either Multi-File Blossom upload or Single-File Inlined execution.",
      icon: "upload",
      children: [
        {
          type: "input",
          name: "pluginFile",
          inputType: "file",
          accept: ".zip,.html,.htm,.js",
          actionOnChange: { name: "file-selected" }
        },
        {
          type: "box",
          direction: "row",
          gap: "sm",
          children: [
            {
              type: "button",
              label: "Load Multi-File Starter Template (.zip)",
              variant: "secondary",
              icon: "package",
              action: { name: "load-starter" }
            }
          ]
        }
      ]
    });

    // 2. Arbitrary URL / NIP-5A Installer Card
    contentChildren.push({
      type: "card",
      title: "Install or Package from Arbitrary URL / NIP-5A naddr",
      subtitle: "Supports remote .zip, .html, or naddr1...",
      icon: "globe",
      children: [
        {
          type: "box",
          direction: "row",
          gap: "sm",
          align: "center",
          children: [
            {
              type: "input",
              name: "arbitraryUrl",
              inputType: "url",
              placeholder: "https://example.com/plugin.zip, https://.../index.html, or naddr1...",
              value: currUrlVal
            },
            {
              type: "button",
              label: "Fetch & Inspect",
              variant: "secondary",
              action: { name: "fetch-url" }
            },
            {
              type: "button",
              label: "Install from URL",
              variant: "primary",
              action: { name: "install-url" }
            }
          ]
        }
      ]
    });

    // 3. Extracted Archive Files (when files are loaded)
    if (currExtracted.length > 0) {
      contentChildren.push({
        type: "card",
        title: `Extracted Archive Files (${currExtracted.length})`,
        subtitle: `Entry point: ${currEntry}`,
        icon: "file",
        children: [
          {
            type: "list",
            items: currExtracted.map((f) => ({
              type: "list-item" as const,
              id: f.path,
              title: f.path,
              subtitle: `${f.mimeType} • ${f.size} B • sha256:${f.sha256.slice(0, 16)}...`,
              icon: "file"
            }))
          }
        ]
      });

      // 4. Metadata & Packaging Options
      contentChildren.push({
        type: "card",
        title: "Plugin Metadata & Packaging Mode",
        children: [
          {
            type: "box",
            direction: "column",
            gap: "sm",
            children: [
              {
                type: "box",
                direction: "row",
                gap: "sm",
                children: [
                  { type: "input", name: "appName", placeholder: "Plugin Name", value: currName },
                  { type: "input", name: "appId", placeholder: "App Slug (NIP-5A 'd' tag)", value: currId },
                  { type: "input", name: "appVersion", placeholder: "Version", value: currVer }
                ]
              },
              { type: "input", name: "appDescription", placeholder: "Description", value: currDesc },
              {
                type: "box",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    type: "button",
                    label: "Option A: Single-File Inlined Bundle",
                    variant: currPackMode === "inlined" ? "primary" : "secondary",
                    action: { name: "set-packaging-mode", payload: { mode: "inlined" } }
                  },
                  {
                    type: "button",
                    label: "Option B: Multi-File Blossom Upload",
                    variant: currPackMode === "multifile" ? "primary" : "secondary",
                    action: { name: "set-packaging-mode", payload: { mode: "multifile" } }
                  }
                ]
              },
              {
                type: "box",
                direction: "row",
                gap: "sm",
                justify: "end",
                children: [
                  {
                    type: "button",
                    label: "Install Locally in Omni (Local Only)",
                    variant: "secondary",
                    action: { name: "install-local" }
                  },
                  {
                    type: "button",
                    label: "Upload to Blossom & Publish (NIP-5A)",
                    variant: "primary",
                    action: { name: "publish-blossom" }
                  }
                ]
              }
            ]
          }
        ]
      });
    }

    // 5. Published Result Card
    if (currResult) {
      contentChildren.push({
        type: "card",
        title: `Published Nsite Ready: ${currResult.name} (v${currResult.version})`,
        subtitle: `Kind 35129 • ${currResult.fileCount} file(s)`,
        icon: "check",
        children: [
          {
            type: "code-block",
            code: currResult.naddr,
            language: "text",
            copyable: true
          },
          {
            type: "box",
            direction: "row",
            gap: "sm",
            justify: "end",
            children: [
              {
                type: "button",
                label: "Copy naddr",
                variant: "secondary",
                action: { name: "copy-naddr", payload: { naddr: currResult.naddr } }
              },
              {
                type: "button",
                label: "Install / Update in Omni",
                variant: "primary",
                action: { name: "open-naddr", payload: { naddr: currResult.naddr } }
              }
            ]
          }
        ]
      });
    }

    // 6. Upload / Publish Progress Bar
    if (currProgress) {
      contentChildren.push({
        type: "card",
        title: "Uploading & Publishing",
        children: [
          {
            type: "progress",
            value: currProgress.current,
            label: currProgress.label
          }
        ]
      });
    }

    // 7. Activity Logs
    if (currLogs.length > 0) {
      contentChildren.push({
        type: "card",
        title: "Activity Logs",
        icon: "code",
        children: [
          {
            type: "code-block",
            code: currLogs.slice(-15).join("\n"),
            language: "text"
          }
        ]
      });
    }
  }

  // --------------------------------------------------------------------------
  // TAB 2: MY PUBLISHED PLUGINS
  // --------------------------------------------------------------------------
  else if (currentTab === "published") {
    contentChildren.push({
      type: "box",
      direction: "row",
      justify: "between",
      align: "center",
      children: [
        {
          type: "text",
          content: "Plugins signed by your Nostr identity (stored in Omni's 0ms local cache and connected Nostr relays as kind: 35129 events).",
          variant: "body",
          tone: "secondary"
        },
        {
          type: "button",
          label: "Query Relays",
          icon: "refresh",
          variant: "secondary",
          action: { name: "refresh-published" }
        }
      ]
    });

    if (currPublished.length === 0) {
      contentChildren.push({
        type: "empty-state",
        title: "No published plugins yet",
        description: "Use the 'Create & Upload' tab to package a .zip archive and publish it."
      });
    } else {
      contentChildren.push({
        type: "box",
        direction: "column",
        gap: "sm",
        children: currPublished.map((app) => ({
          type: "card",
          title: `${app.name} v${app.version}`,
          subtitle: `d:${app.id} • ${app.packagingMode === "multifile" ? `${app.fileCount} files on Blossom` : "Single-File Inlined / Local Store"}`,
          icon: app.icon || "widgets",
          children: [
            {
              type: "text",
              content: app.description || "No description provided.",
              variant: "body"
            },
            {
              type: "code-block",
              code: app.naddr,
              language: "text",
              copyable: true
            },
            {
              type: "box",
              direction: "row",
              gap: "xs",
              justify: "end",
              children: [
                {
                  type: "button",
                  label: "Install / Update",
                  variant: "primary",
                  action: { name: "open-naddr", payload: { naddr: app.naddr } }
                },
                {
                  type: "button",
                  label: "Update .zip",
                  variant: "secondary",
                  action: {
                    name: "prepare-update",
                    payload: { appId: app.id, appName: app.name, appVersion: app.version, appDescription: app.description }
                  }
                },
                {
                  type: "button",
                  label: "Copy naddr",
                  variant: "secondary",
                  action: { name: "copy-naddr", payload: { naddr: app.naddr } }
                },
                {
                  type: "button",
                  label: "Delete",
                  variant: "danger",
                  action: { name: "delete-app", payload: { appId: app.id } }
                }
              ]
            }
          ]
        }))
      });
    }
  }

  // --------------------------------------------------------------------------
  // TAB 3: BLOSSOM SERVERS
  // --------------------------------------------------------------------------
  else if (currentTab === "servers") {
    contentChildren.push({
      type: "card",
      title: "Blossom Server Endpoints (BUD-01 / Kind 10063)",
      subtitle: "Public Blossom servers store content-addressed blobs by SHA-256 hash using your Nostr signature (kind 24242) for authentication.",
      icon: "server",
      children: [
        {
          type: "box",
          direction: "row",
          justify: "end",
          children: [
            {
              type: "button",
              label: "Publish Server List (Kind 10063)",
              variant: "primary",
              action: { name: "publish-servers-list" }
            }
          ]
        },
        {
          type: "box",
          direction: "row",
          gap: "sm",
          align: "center",
          children: [
            {
              type: "input",
              name: "newServerUrl",
              inputType: "url",
              placeholder: "https://blossom.example.com",
              value: currNewSrv
            },
            {
              type: "button",
              label: "+ Add Server",
              variant: "secondary",
              action: { name: "add-server" }
            }
          ]
        },
        {
          type: "list",
          items: currServers.map((s) => ({
            type: "list-item" as const,
            id: s.url,
            title: s.url,
            subtitle: `${s.status || "Ready"} • ${s.enabled ? "Active" : "Disabled"}`,
            icon: "server",
            actions: [
              {
                type: "button" as const,
                label: s.enabled ? "Disable" : "Enable",
                variant: "secondary" as const,
                action: { name: "toggle-server", payload: { url: s.url } }
              },
              {
                type: "button" as const,
                label: "Remove",
                variant: "danger" as const,
                action: { name: "remove-server", payload: { url: s.url } }
              }
            ]
          }))
        }
      ]
    });
  }

  return {
    type: "box",
    direction: "column",
    gap: "md",
    page: {
      id: currentTab,
      title: currentTab === "create" ? "Plugin Studio" : currentTab === "published" ? "My Published Plugins" : "Blossom Servers",
      url: currentTab === "create" ? "" : `?tab=${currentTab}`,
      state: currentTab === "create" ? null : { tab: currentTab }
    },
    children: [headerCard, ...contentChildren]
  };
}

export function getPublisherWidgetSchema(state = getPublisherState()): OmniComponentNode {
  return {
    type: "card",
    title: "Plugin Studio",
    subtitle: "Packaging & Blossom distribution",
    icon: "package",
    children: [
      {
        type: "metric",
        label: "Published Plugins",
        value: String(state.publishedApps.length),
        trend: "up"
      },
      {
        type: "text",
        content: `${state.servers.filter((s) => s.enabled).length} active Blossom server(s) configured.`,
        variant: "body",
        tone: "secondary"
      },
      {
        type: "button",
        label: "Open Plugin Studio",
        variant: "primary",
        action: { name: "open-studio" }
      }
    ]
  };
}
