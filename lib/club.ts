// The club's own identity, as it must appear on a printed document.
//
// This deliberately does NOT come from public.settings: that table is admin-only
// (settings_admin_all), so a member printing their own invoice would get a blank
// letterhead. These values change roughly never, so a constant is both honest
// and faster than a query.
//
// Everything below is a real, verified detail of KÇ Prishtina 038 except the two
// optional blocks (`fiscalNumber`, `bank`), which are left null until the club
// supplies them. Anything null is OMITTED from the document — never printed as
// an empty label, and never invented. The club has no NUI / TVSH number in this
// project, so nothing of the sort is implied anywhere.

/** Bank details for a transfer. All of it or none of it — a half IBAN is useless. */
export type ClubBank = {
  /** Bank name as the member would recognise it, e.g. "ProCredit Bank". */
  bankName: string;
  /** Account holder exactly as registered at the bank. */
  accountName: string;
  /** Full IBAN, spaced however it should be read. */
  iban: string;
  /** SWIFT / BIC — only needed for transfers from abroad. Optional. */
  swift?: string | null;
};

export type ClubIdentity = {
  shortName: string;
  legalName: string;
  address: string;
  email: string;
  website: string;
  /** Federation registration line, printed under the address. */
  registration: string;
  /**
   * Fiscal / business number, IF the club ever registers one and wants it on
   * invoices. Null today — and while null the line simply does not exist.
   */
  fiscalNumber: string | null;
  /** Bank transfer details. Null today; see PAYMENT_FALLBACK below. */
  bank: ClubBank | null;
};

export const CLUB: ClubIdentity = {
  shortName: "KÇ Prishtina 038",
  legalName: "Klubi Çiklistik Prishtina 038",
  address: "Rruga e Maleve 14, 10000 Prishtinë",
  email: "info@prishtina038.cc",
  website: "prishtina038.cc",
  registration: "I regjistruar pranë FÇK · ID: KS-22-038",

  // ---- fill these in when the club provides them -------------------------
  // fiscalNumber: "600123456",
  fiscalNumber: null,
  // bank: {
  //   bankName: "…",
  //   accountName: "Klubi Çiklistik Prishtina 038",
  //   iban: "XK00 0000 0000 0000 0000",
  //   swift: null,
  // },
  bank: null,
};

/**
 * What an unpaid invoice tells the member when no IBAN is configured. An
 * invoice nobody can act on is worse than no invoice, so this must always say
 * something a person can actually do.
 */
export const PAYMENT_FALLBACK =
  `Pagesa kryhet te zyra e klubit. Nëse dëshiron të paguash me transfer bankar, ` +
  `shkruaj në ${CLUB.email} dhe klubi të dërgon të dhënat e llogarisë. ` +
  `Fatura shënohet si e paguar nga klubi sapo pagesa të pranohet.`;
