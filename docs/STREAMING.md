# Stream Studio, OPSEC and OBS

This guide covers the implemented broadcast features in **0.8.0-rc.17**, the current 0.8.0 review candidate. [Install and connect Kairo](USER-GUIDE.md) first; the [documentation index](README.md) links the other guides.

**Stream studio** chooses the content sent to a transparent browser source. **OPSEC control** decides whether your configured covers are required. Its optional OBS connection can also change saved scene items, audio, filters and the program scene. These are separate controls: a browser source does not require the OBS WebSocket connection.

## Put Kairo in your scene

1. Start Kairo on the same computer as OBS or Streamlabs.
2. Open **Stream studio → Browser sources & setup** and copy **Full canvas**. With default ports this is `http://127.0.0.1:4381/stream`.
3. Add a **Browser Source** in your scene, paste that URL and set its size to **1920 × 1080**. Keep the source loaded when the scene is inactive so events continue to arrive.
4. Place the Kairo source above the game capture if its covers must conceal parts of the game. Align its canvas with the game image; any source transform/crop changes the coverage you get.
5. Return to **Layout editor**, add elements, position them and choose **Save changes**.
6. Inspect **Live output**, then **Test toast**. Check the actual OBS preview/output as well as Kairo's editor.

The initial canvas is completely transparent and empty. No default widgets, cover regions or automatic toasts are installed. The checkerboard and editor labels are not broadcast. All already-loaded sources receive saved changes without a manual reload. Use the URL displayed by Kairo if you changed the default stream port.

| Source | Default URL | Includes |
| --- | --- | --- |
| Full canvas | `http://127.0.0.1:4381/stream` | Saved visible widgets, applicable OPSEC covers and notifications. |
| Notifications only | `http://127.0.0.1:4381/stream/toasts` | Toasts without layout widgets/covers. |
| OPSEC covers only | `http://127.0.0.1:4381/stream/opsec` | Saved visible covers when protection requires them. |
| This widget only | Copy the selected element's `/stream/widget/<id>` URL | That widget in its saved canvas position; no toast lane. |

Choose sources deliberately. A notifications-only source cannot conceal the game, and adding the full canvas plus notifications-only source to the same scene can display a toast twice.

## Edit the layout

Select an element in the canvas or **LAYERS**, then edit **Properties**. Drag to position; arrow keys move the selected element in four-pixel steps. **X**, **Y**, **WIDTH** and **HEIGHT** give precise canvas coordinates. Use **Duplicate element** for another copy, the eye control to show/hide it, and **Remove element** to delete it. Up to 50 elements are supported.

**Signal surface** supplies the framed presentation; **Minimal / plain filler** uses a plain background. **Label**, **Text**, font size and accent are editable. **Background** changes the opacity of ordinary widgets; an **OPSEC cover** is always opaque. Use **Blank panel** for translucent filler.

| Template | Common use |
| --- | --- |
| **Blank panel** | A plain filler/background region. |
| **Text block**, **Lower third** | Your chosen text or an explicitly linked Kairo value. Replace sample wording before broadcasting. |
| **Countdown** | A manual countdown restarted in minutes, or a linked training/job countdown. |
| **EVE clock** | UTC/EVE clock. |
| **Kairo goal** | An existing objective's title/numbers and progress bar. |
| **Progress bar** | A manual percentage or linked goal/training/job progress. |
| **OPSEC cover** | An opaque region shown when protection is required. |
| **Divider** | A visual separator. |

The editor displays **Unsaved changes** until **Save changes** succeeds. **Live output** previews the saved output, so an unsaved edit need not match it. The **Output enabled / Output paused** and **Sounds allowed / Sounds muted** toggles also need saving. Pausing hides ordinary widgets and clears queued/visible notifications; saved enabled OPSEC covers remain active. Resuming does not replay cleared notifications.

## Link a widget to Kairo

1. Select a suitable element and open **Pull from Kairo**.
2. Choose the source and its **Character**, or an **Existing goal**.
3. Inspect **LINK PREVIEW**. For a goal choose **Title and progress numbers**, **Title only** or **Progress numbers only**.
4. Choose **Save changes** to approve those display fields for broadcast.

| Binding | Display |
| --- | --- |
| **Goals · an existing objective** | Selected goal's title/progress; the bar follows its percentage. The picker includes local and other characters' goals and retains the chosen owner. |
| **Sessions · active session timer** | Elapsed wall-clock time of that character's active session. |
| **Sessions · session kills / losses** | Active-session personal kill/loss counts. |
| **Goals · completed count** | Completed objectives for the selected source. |
| **Wallet · balance** | That character's latest usable wallet balance. |
| **Pilot · current hull** | Current hull name. |
| **Training · current skill** / **current skill progress** | Current training title, timer or percentage, depending on widget. |
| **Industry · next job** / **next job progress** | Earliest-ending active or ready job title, countdown or percentage; a ready job can remain at zero until delivered. |

Available bindings depend on the template: countdowns accept training/jobs, progress bars accept goals/training/jobs, and text-like widgets accept the broader selection. EVE clocks, dividers and OPSEC covers have no private-data binding. **Refresh linked sources** updates the picker/preview when needed.

Wallet, hull, training and industry bindings require usable fresh snapshots and enabled source modules; otherwise they show an unavailable state. Goal and Session bindings use retained local records, so an automatic goal can still display its last confirmed progress while its underlying collector is stale or disabled. A selected character must remain connected with usable authorisation. An empty queue or no active Session has an idle state. A lost event connection displays **Source disconnected** for bound widgets instead of keeping a live-looking value.

Kairo does not stream raw ESI snapshots, credentials or private notes. Explicitly selected notification fields can include a job ID (`{{job}}`) or killmail ID (`{{record}}`); review the saved wording before broadcasting.

Binding a wallet, goal or session can intentionally reveal a financial value, objective title or session label. Saved custom text is also broadcast as written. OPSEC location-field redaction does not redact arbitrary text that you type into widgets.

## Configure notifications

Open **Notification rules**. Rules are disabled by default. Supported automatic events are skill completion, industry job ready, objective completion, session start/end, kill/loss recorded, system change and OPSEC state change; a separate test notification is available.

For each desired rule:

1. Enable its switch and write **Message**, or select **Use event context** for the suggested wording.
2. Insert the listed fields with the token buttons, such as `{{hull}}`, `{{goal}}`, `{{skill}}`, `{{state}}`, `{{previous}}` or `{{reason}}`. Available tokens differ by event.
3. Set **Fire for** to all connected characters or one character. Set duration, cooldown, delay and **Sound**.
4. Select the **Toast position**, then **Save changes**.
5. Choose **Test saved rule** to see an illustrative example from the saved configuration. A manual test does not prove the automatic event or character filter has fired.

The message is limited to 240 characters and rendered at most two lines; put the essential detail first. Duration is 2–30 seconds, cooldown 0–3,600 seconds and delay 0–600 seconds. The renderer shows at most three notifications at a time, while the server retains a bounded recent queue. A burst can displace older notifications; this is a broadcast display, not a durable event inbox.

`{{system}}` and `{{region}}` become **Protected location** while protection is engaged unless that rule enables **Allow location fields while protected**. Protection is rechecked for delayed and already-visible toasts. Saving a narrower character filter or disabling a rule removes automatic notifications that no longer qualify. Explicit saved-rule tests use example context and remain manual emissions.

Sound needs both the rule's **Sound** switch and **Sounds allowed**, plus browser-source audio configured in OBS/Streamlabs. Audio monitoring controls whether you hear it locally. Browser audio policy may suppress sound while text still displays. Historical collection does not deliberately replay old activity as fresh stream toasts.

## Position and configure OPSEC covers

1. In **Stream studio**, add an **OPSEC cover** for each EVE UI region you intend to conceal. Size/position it, leave **Visible** enabled, then **Save changes**. Default wording is `//Element Disabled` and `//IMPERIUM BROADCAST RULES`.
2. Open **OPSEC control**. Set **Character to protect** explicitly, or use **First connected character**. This choice is independent of the dashboard's active pilot.
3. Use **Force protection on** when immediate concealment is needed. This switch saves immediately and takes precedence over every category.
4. Set optional **Blue alliance IDs** and **Hostile alliance IDs** as comma-separated numeric IDs. Leave **Release covers in High-Sec** off unless you intend verified non-FW high-sec to reveal those areas.
5. Choose **Save protection rules** for the configured character, policy lists and high-sec setting. Check the current state/reason and **Standings access**.

The OPSEC banner reports **COVERS REQUIRED** or **HIGH-SEC · COVERS RELEASED**; it cannot verify that you added a cover or that OBS placed it above the sensitive region. Blue classification still requires covers. Only an explicitly released, verified High-Sec state hides them.

### Space categories and standings

| Category | Classification |
| --- | --- |
| **Blue** | Positive Good/Excellent standing, your own alliance, or explicit blue policy. |
| **Hostile** | Negative Bad/Terrible standing or explicit hostile policy. |
| **Low-Sec** | Known space with displayed security 0.1–0.4. |
| **Neutral** | Neutral/no matching standing in available contact lists, or unclaimed null-sec. |
| **High-Sec** | Known space with displayed security 0.5–1.0; covered unless explicitly released. |
| **Triglavian Space** | Pochven or identified Abyssal Deadspace. |
| **Anoikis** | Identified wormhole/J-space systems. |
| **Unknown** | Missing, outdated, unsupported or unavailable required context. Covered. |
| **Faction Warfare** | Detected warzone override. Covered. |
| **Manual** | Forced protection override. Covered. |

Classification priority is Manual, special space, Faction Warfare, sovereignty standings, then security. Explicit blue policy is checked before explicit hostile policy; avoid putting an ID in both. Your own alliance follows explicit policy. For other sovereignty holders, Kairo uses the first matching alliance entry from available personal, corporation, then alliance contacts. An explicit Neutral entry also takes precedence over less-specific lists.

To use organization contacts, register `esi-corporations.read_contacts.v1` and `esi-alliances.read_contacts.v1` in your EVE application and use **Connections → Update access**. The OPSEC scopes also include `esi-characters.read_contacts.v1` for personal contacts. EVE roles and permissions still determine which organization lists the character can read.

**Standings access** distinguishes available, permission-needed, disabled, waiting, unavailable and no-organization sources. A failed requested list is not treated as empty, and truncated lists cannot establish a complete classification. Organization data is tied to the current corporation/alliance, so an old membership's contacts cannot silently become the new organization's list. Kairo does not infer a coalition from an alliance name or supply a hardcoded coalition policy.

### Freshness and loss of connection

OPSEC uses polled ESI context. Location must be under 30 seconds old; other required context has a bounded refresh allowance after expiry. During a brief gap Kairo can retain the last covered category and its OBS actions as **UPDATING · COVERED**, ending no later than 30 seconds after the last verified location (or sooner when required evidence expires). Released High-Sec is never carried through missing location. Explicit access/module failures do not receive that continuity allowance.

A loaded stream renderer retains enabled cover geometry when its local event connection fails and shows the covers under Unknown. It remembers a sanitized layout for reload/reconnect when browser storage is available. This requires covers to have been saved and loaded beforehand; a new browser source with no received layout cannot invent their geometry. Removing, hiding, cropping or unloading the browser source in OBS can defeat that coverage.

Fast transits can be delayed or missed between ESI samples. If usable ESI location is unavailable during an Abyssal transit, Kairo cannot infer it from a desired destination. Use **Force protection on** whenever the broadcast needs immediate concealment.

## OBS state actions

Direct automation requires a local **OBS WebSocket 5** server. Browser-source output works independently in OBS/Streamlabs; compatibility with a browser source alone does not imply compatible direct automation.

1. In OBS Studio, open **Tools → WebSocket Server Settings**, enable the server and authentication, and note its port/password.
2. In **OPSEC control → Control OBS directly**, enable **Connect to local OBS**, enter **Local WebSocket port** (default `4455`) and **OBS password**, then **Save & connect**. Only `127.0.0.1` is supported; the password is stored encrypted by the local credential vault.
3. Once connected, select **Read OBS targets**. Rules are bound to this scene collection. If the current collection differs, **Start rules for this collection** clears the editor's old rules and disables automation; configure and save the new collection deliberately.
4. Choose a state tab and **Add state action**. Available kinds are **Source visibility**, **Audio mute**, **Source filter** and **Program scene**.
5. Select the exact target and desired state. A source target is a particular occurrence within a scene/group, not every source sharing its name. Nested scenes can be targeted as scene items. An audio input must support audio.
6. Configure each required state. **Copy to all protected states** copies the selected non-High-Sec list to the other covered states, including Manual and Faction Warfare; configure High-Sec separately.
7. Enable **Apply actions automatically**, then **Save OBS rules**. Saving immediately applies the current state, then follows transitions/reconnections. Use **Apply current state** to reapply saved rules; inspect **Recent OBS actions** for results.

There can be up to 80 actions per state. Unlisted targets retain their current OBS state. Configure both the covered and intended reveal behavior; switching category does not automatically undo an earlier action.

Hides and mutes run first, then filters/reveals, with scene switches last. A failed protective hide/mute blocks later reveals/switches while other protective actions are still attempted. Kairo verifies the saved scene collection and source-item identity. State changes cancel obsolete queued actions; reconnection applies the latest state instead of replaying every old transition. Authentication rejection or a server-ended session requires **Reconnect saved** or corrected settings.

**Program scene** changes live program output even with OBS Studio Mode active. Kairo does not start or stop streaming/recording. A disconnected WebSocket cannot change OBS sources, so keep your saved browser-source covers loaded.

For migrated installations, previously Unknown categories inherit those actions once. High-Sec preserves the previous covered/released policy; an available **Use previous Safe actions** option lets you choose retained legacy Safe rules. Saving an intentionally empty action list does not trigger inheritance again.

## Troubleshooting and practical checks

| Symptom | Check |
| --- | --- |
| Full canvas is blank | The default is empty. Add a visible element, save, verify output is enabled and use the correct source URL. Covers may be hidden by released High-Sec. |
| Editor differs from OBS | Check **Unsaved changes**, **Live output**, the browser-source URL and its dimensions/transform. |
| Goal/widget shows unavailable | Confirm the bound owner, selected record, source module, access and timestamp; use **Refresh linked sources**. |
| Test toast does not appear | Save the output toggle and rule; check paused output, configured delay and whether the source supports toasts. Widget-only and covers-only sources do not. |
| Automatic event does not toast | Enable/save its rule, check **Fire for**, cooldown and source collection. Manual tests use illustrative context. |
| Text appears without sound | Check rule sound, global mute, browser-source audio and OBS monitoring. |
| OPSEC says Unknown | Read its reason and Standings access; confirm the protected character, enabled modules, scopes and fresh location/context. |
| Covers required but an area is visible | Inspect saved cover visibility/geometry and OBS source order, crop and transforms. The status does not measure pixels on your scene. |
| OBS actions fail or target is missing | Reconnect if needed, **Read OBS targets**, confirm the active scene collection and exact scene-item/filter/input, then save corrected rules. |

Before relying on a broadcast layout, check its actual game regions, source order, startup/reload, disconnection behavior and scene transitions in OBS on your PC. Chrome/Firefox browser checks and mocked OBS protocol tests do not establish actual OBS rendering/audio, Windows/DPAPI behavior or live EVE permission/SSO behavior; [Validation](VALIDATION.md) records those environment-specific limits.

## Privacy boundary and implementation references

The stream service is a separate loopback origin with a read-only route allowlist and sanitized display state. It cannot serve the dashboard API. Private notes, raw character snapshots and credentials are excluded. Static widget wording and approved bound values are intentionally visible; screen-capturing Kairo's private dashboard bypasses that separation. See [data retention](DATA-RETENTION.md) for local storage and backups, and [architecture](ARCHITECTURE.md) for the security/runtime boundary.

Maintainers should read [Studio](../components/kairo/studio.tsx), [OPSEC controls](../components/kairo/opsec-controls.tsx), [OBS controls](../components/kairo/obs-controls.tsx), [projections](../server/projections.mjs), [stream owner](../server/stream.mjs), [classification](../server/opsec.mjs), [OBS owner](../server/obs.mjs) and the [renderer](../public/stream/render.js). Existing behavioral coverage includes stream projection/render/scheduling/scope/atomic-save tests, protection-activity tests and OBS save/choice/protocol coverage. No new application behavior is introduced by this guide.
