# Android web parity implementation plan

1. Inspect mobile web and record page/interaction baseline.
2. Add shared Compose web palette, spacing, cards and controls. Parent owns shell, forms, ViewModel, record identity and integration.
3. In independent file scopes: implement Bazi result/timeline; implement Ziwei/Qimen result interaction; implement AI/history/settings pages. Preserve source algorithms and existing frozen tests.
4. Integrate original web navigation, solar/lunar date dialog, eight Liuyao methods, result actions, native Liuyao table and guaci.
5. Build/test; visually compare mobile web and emulator. Exercise state restoration and save/update behaviors. Review integrated branch and fix findings.
6. Produce updated APK and adb update the previously identified phone, retaining app data. Record evidence and limitations.

Shared contracts: WebTheme.kt owned by parent exports LocalWebPalette (primary/secondary/accent/background/ink/muted/border/tint), WebCard(title:String="",content:@Composable ColumnScope.()->Unit), WebHeading(title,subtitle), WebPill(text,selected,onClick), WebPrimaryButton(text,onClick,enabled=true), WebSectionTitle(text). Result composables take record:SavedChart and onAsk:()->Unit; they are non-scrolling Column content hosted by shell. Delegates may use MaterialTheme directly until shared primitives land. Page composables receive AppState and ChartViewModel with explicit navigation callbacks. No shared AppUi or ViewModel edits by delegates.
