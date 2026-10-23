// Reference-only metadata. No report text, financial facts or reuse permission.
export const SOURCE_CATALOG_VERSION = "2026-10-24";
export const SOURCE_CATALOG = Object.freeze(
  [
    {
      id: "kingdee-fy2023-results",
      company: "金蝶国际软件集团有限公司",
      period: "2023",
      title: "2023 年度业绩公告（英文）",
      url: "https://investor.kingdee.com/static/temp/ew_ANNUALRESULTSANNOUNCEMENTFORTHEYEARENDED31DECEMBER2023ANDPROPOSEDADOPTIONOFAMENDEDANDRESTATEDMEMORANDUMANDARTICLESOFASSOCIATIONOFTHE_1710762379226.pdf",
      index_url:
        "https://investor.kingdee.com/en/announcements-circulars/s-2024/",
      published_on: "2024-03-18",
      accessed_on: "2026-10-24",
      access_timezone: "Asia/Taipei",
      bytes: 1126393,
      sha256:
        "dd453567d91ae07d1db89bfc227fa441dba06f1de84ff819f6ee8f9484f7e5c7",
      page_count: 55,
      licensing_status: "not_verified",
    },
    {
      id: "kingdee-fy2024-results",
      company: "金蝶国际软件集团有限公司",
      period: "2024",
      title: "2024 年度业绩公告（英文）",
      url: "https://investor.kingdee.com/static/temp/ew_ANNUALRESULTSANNOUNCEMENTFORTHEYEARENDED31DECEMBER2024_1742214432268.pdf",
      index_url:
        "https://investor.kingdee.com/en/announcements-circulars/s-2025/",
      published_on: "2025-03-17",
      accessed_on: "2026-10-24",
      access_timezone: "Asia/Taipei",
      bytes: 474346,
      sha256:
        "ecf72f0a9ccfaec14fa1dc174d8f8cd31c1773e5f59c3e5edbcb01d15497d4ca",
      page_count: 55,
      licensing_status: "not_verified",
    },
  ].map(Object.freeze),
);

// file.sha256 and file.bytes must come from inspectPdf's actual-byte read.
// This is version identification against a maintainer's observed snapshot,
// not a signature, fresh origin check, independent review or licensing grant.
export function identifySource(file) {
  const record =
    SOURCE_CATALOG.find(
      (r) =>
        Number.isSafeInteger(file?.bytes) &&
        file.bytes === r.bytes &&
        typeof file?.sha256 === "string" &&
        file.sha256 === r.sha256,
    ) ?? null;
  return Object.freeze({
    catalog_version: SOURCE_CATALOG_VERSION,
    status: record ? "catalog_byte_match" : "not_in_catalog",
    record,
    verification_status: "not_reviewed",
    licensing_status: "not_verified",
    financial_calculation_eligible: false,
  });
}
