import { useTranslation } from "react-i18next";
import type { BrandingColors } from "@/utils/brandingPalette";
import type { WelcomeText } from "@/services/countryBrandingService";

// §6.3 de la spec conf-pays (JP 11/11) — aperçu SIMPLE de la configuration d'un pays, au format téléphone : en-tête
// (principale / texteSurPrincipale), carte d'accueil (surface / texte / texteDiscret), champ (champ / bordure), bouton
// d'action (accent / texteSurAccent), bouton secondaire et lien (principale), fond d'écran (fond).
// Les couleurs viennent de la configuration saisie (ce sont des DONNÉES, pas des couleurs de marque du back-office) :
// d'où les styles en ligne, seule façon de montrer la palette d'un autre pays.
// D-PAYS-03 : le logo est un fichier intégré aux apps, pas un champ — l'aperçu montre une pastille avec l'initiale.
// D-PAYS-08 : polices Shephr inchangées (variables --font-* du back-office). §4.5 : « propulsé par Shephr » fixe.

export function BrandingPreview({
  colors, displayName, shortName, welcome, websiteUrl,
}: {
  colors: BrandingColors;
  displayName: string;
  shortName: string;
  welcome: WelcomeText;
  websiteUrl: string;
}) {
  const { t } = useTranslation();
  const c = colors;
  const name = displayName.trim() || t("countryBranding.preview.namePlaceholder");
  const short = shortName.trim() || name;
  const initial = (short.trim()[0] ?? "S").toUpperCase();

  return (
    <div
      aria-label={t("countryBranding.preview.title")}
      style={{
        width: 300, maxWidth: "100%", margin: "0 auto", borderRadius: 34, padding: 10,
        background: "#1A1A1A", boxShadow: "var(--shadow-lg)",
      }}
    >
      <div style={{ borderRadius: 26, overflow: "hidden", background: c.fond, minHeight: 560, display: "flex", flexDirection: "column" }}>
        {/* En-tête */}
        <div style={{ background: c.principale, color: c.texteSurPrincipale, padding: "26px 16px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div
            title={t("countryBranding.preview.logoHint")}
            style={{
              width: 34, height: 34, borderRadius: "50%", background: "#FFFFFF", color: c.principale,
              display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: 16,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{t("countryBranding.preview.hello")}</div>
          </div>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
          {/* Carte d'accueil */}
          <div style={{ background: c.surface, borderRadius: 14, padding: 14, border: `1px solid ${c.bordure}` }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, color: c.texte, lineHeight: 1.25, marginBottom: 6 }}>
              {welcome.title.trim() || t("countryBranding.preview.titlePlaceholder")}
            </div>
            <div style={{ fontSize: 12.5, color: c.texteDiscret, lineHeight: 1.45 }}>
              {welcome.text.trim() || t("countryBranding.preview.textPlaceholder")}
            </div>
            {websiteUrl.trim() && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: c.principale, textDecoration: "underline" }}>
                {t("countryBranding.preview.website")}
              </div>
            )}
          </div>

          {/* Champ */}
          <div>
            <div style={{ fontSize: 11.5, color: c.texteDiscret, marginBottom: 4 }}>{t("countryBranding.preview.fieldLabel")}</div>
            <div style={{ background: c.champ, border: `1px solid ${c.bordure}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, color: c.texte }}>
              {t("countryBranding.preview.fieldValue")}
            </div>
          </div>

          {/* Bouton d'action principal (accent) et bouton secondaire (principale) */}
          <div style={{ background: c.accent, color: c.texteSurAccent, borderRadius: 12, padding: "11px 12px", textAlign: "center", fontWeight: 600, fontSize: 13.5 }}>
            {t("countryBranding.preview.primaryButton")}
          </div>
          <div style={{ border: `1.5px solid ${c.principale}`, color: c.principale, borderRadius: 12, padding: "9px 12px", textAlign: "center", fontWeight: 500, fontSize: 13 }}>
            {t("countryBranding.preview.secondaryButton")}
          </div>

          {/* Lien */}
          <div style={{ fontSize: 13, color: c.principale, textDecoration: "underline", textAlign: "center" }}>
            {t("countryBranding.preview.link")}
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ textAlign: "center", fontSize: 10.5, color: c.texteDiscret }}>{t("countryBranding.preview.poweredBy")}</div>
        </div>

        {/* Barre d'onglets : onglet actif en principale, autres en texteDiscret */}
        <div style={{ display: "flex", borderTop: `1px solid ${c.bordure}`, background: c.surface }}>
          {(["home", "events", "profile"] as const).map((k, i) => (
            <div key={k} style={{ flex: 1, textAlign: "center", padding: "9px 0 12px", fontSize: 11, color: i === 0 ? c.principale : c.texteDiscret, fontWeight: i === 0 ? 600 : 400 }}>
              {t(`countryBranding.preview.tabs.${k}`)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
