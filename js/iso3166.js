// ======================================================================
// ISO 3166-1 alpha-2 — the codes a country named location accepts.
//
// WHY THIS FILE EXISTS. Entra takes two-letter codes typed by hand, and a
// wrong code is still a VALID code: the policy saves, looks right in the
// portal, and covers the wrong country until somebody is blocked or — worse —
// is not. Ireland is IE; IR is Iran. Austria is AT, Australia AU. Sweden is
// SE, Switzerland CH.
//
// PROVENANCE, because a list of countries typed from memory is exactly the
// failure this is meant to prevent. The 249 officially assigned codes come
// from the ISO 3166-1 register; every one was then confirmed against the ICU
// database, which knows all 249 and 31 more. Those 31 — AC AN BU CP CQ CS DD
// DG DY EA EU EZ FX HV IC NH QO RH SU TA TP UK UN VD XA XB XK YD YU ZR ZZ —
// are exceptionally reserved, deprecated or user-assigned, NOT officially
// assigned, and are deliberately absent: UK is not a code (GB is), and
// offering it would create the very mistake this exists to prevent.
//
// Names are ICU's English short forms because they are what somebody types:
// "Iran", not "Iran, Islamic Republic of".
// ======================================================================
const ISO3166 = (() => {
  const LIST = [
    ["AF", "Afghanistan"],
    ["AX", "Åland Islands"],
    ["AL", "Albania"],
    ["DZ", "Algeria"],
    ["AS", "American Samoa"],
    ["AD", "Andorra"],
    ["AO", "Angola"],
    ["AI", "Anguilla"],
    ["AQ", "Antarctica"],
    ["AG", "Antigua & Barbuda"],
    ["AR", "Argentina"],
    ["AM", "Armenia"],
    ["AW", "Aruba"],
    ["AU", "Australia"],
    ["AT", "Austria"],
    ["AZ", "Azerbaijan"],
    ["BS", "Bahamas"],
    ["BH", "Bahrain"],
    ["BD", "Bangladesh"],
    ["BB", "Barbados"],
    ["BY", "Belarus"],
    ["BE", "Belgium"],
    ["BZ", "Belize"],
    ["BJ", "Benin"],
    ["BM", "Bermuda"],
    ["BT", "Bhutan"],
    ["BO", "Bolivia"],
    ["BA", "Bosnia & Herzegovina"],
    ["BW", "Botswana"],
    ["BV", "Bouvet Island"],
    ["BR", "Brazil"],
    ["IO", "British Indian Ocean Territory"],
    ["VG", "British Virgin Islands"],
    ["BN", "Brunei"],
    ["BG", "Bulgaria"],
    ["BF", "Burkina Faso"],
    ["BI", "Burundi"],
    ["KH", "Cambodia"],
    ["CM", "Cameroon"],
    ["CA", "Canada"],
    ["CV", "Cape Verde"],
    ["BQ", "Caribbean Netherlands"],
    ["KY", "Cayman Islands"],
    ["CF", "Central African Republic"],
    ["TD", "Chad"],
    ["CL", "Chile"],
    ["CN", "China"],
    ["CX", "Christmas Island"],
    ["CC", "Cocos (Keeling) Islands"],
    ["CO", "Colombia"],
    ["KM", "Comoros"],
    ["CG", "Congo - Brazzaville"],
    ["CD", "Congo - Kinshasa"],
    ["CK", "Cook Islands"],
    ["CR", "Costa Rica"],
    ["CI", "Côte d’Ivoire"],
    ["HR", "Croatia"],
    ["CU", "Cuba"],
    ["CW", "Curaçao"],
    ["CY", "Cyprus"],
    ["CZ", "Czechia"],
    ["DK", "Denmark"],
    ["DJ", "Djibouti"],
    ["DM", "Dominica"],
    ["DO", "Dominican Republic"],
    ["EC", "Ecuador"],
    ["EG", "Egypt"],
    ["SV", "El Salvador"],
    ["GQ", "Equatorial Guinea"],
    ["ER", "Eritrea"],
    ["EE", "Estonia"],
    ["SZ", "Eswatini"],
    ["ET", "Ethiopia"],
    ["FK", "Falkland Islands"],
    ["FO", "Faroe Islands"],
    ["FJ", "Fiji"],
    ["FI", "Finland"],
    ["FR", "France"],
    ["GF", "French Guiana"],
    ["PF", "French Polynesia"],
    ["TF", "French Southern Territories"],
    ["GA", "Gabon"],
    ["GM", "Gambia"],
    ["GE", "Georgia"],
    ["DE", "Germany"],
    ["GH", "Ghana"],
    ["GI", "Gibraltar"],
    ["GR", "Greece"],
    ["GL", "Greenland"],
    ["GD", "Grenada"],
    ["GP", "Guadeloupe"],
    ["GU", "Guam"],
    ["GT", "Guatemala"],
    ["GG", "Guernsey"],
    ["GN", "Guinea"],
    ["GW", "Guinea-Bissau"],
    ["GY", "Guyana"],
    ["HT", "Haiti"],
    ["HM", "Heard & McDonald Islands"],
    ["HN", "Honduras"],
    ["HK", "Hong Kong SAR China"],
    ["HU", "Hungary"],
    ["IS", "Iceland"],
    ["IN", "India"],
    ["ID", "Indonesia"],
    ["IR", "Iran"],
    ["IQ", "Iraq"],
    ["IE", "Ireland"],
    ["IM", "Isle of Man"],
    ["IL", "Israel"],
    ["IT", "Italy"],
    ["JM", "Jamaica"],
    ["JP", "Japan"],
    ["JE", "Jersey"],
    ["JO", "Jordan"],
    ["KZ", "Kazakhstan"],
    ["KE", "Kenya"],
    ["KI", "Kiribati"],
    ["KW", "Kuwait"],
    ["KG", "Kyrgyzstan"],
    ["LA", "Laos"],
    ["LV", "Latvia"],
    ["LB", "Lebanon"],
    ["LS", "Lesotho"],
    ["LR", "Liberia"],
    ["LY", "Libya"],
    ["LI", "Liechtenstein"],
    ["LT", "Lithuania"],
    ["LU", "Luxembourg"],
    ["MO", "Macao SAR China"],
    ["MG", "Madagascar"],
    ["MW", "Malawi"],
    ["MY", "Malaysia"],
    ["MV", "Maldives"],
    ["ML", "Mali"],
    ["MT", "Malta"],
    ["MH", "Marshall Islands"],
    ["MQ", "Martinique"],
    ["MR", "Mauritania"],
    ["MU", "Mauritius"],
    ["YT", "Mayotte"],
    ["MX", "Mexico"],
    ["FM", "Micronesia"],
    ["MD", "Moldova"],
    ["MC", "Monaco"],
    ["MN", "Mongolia"],
    ["ME", "Montenegro"],
    ["MS", "Montserrat"],
    ["MA", "Morocco"],
    ["MZ", "Mozambique"],
    ["MM", "Myanmar (Burma)"],
    ["NA", "Namibia"],
    ["NR", "Nauru"],
    ["NP", "Nepal"],
    ["NL", "Netherlands"],
    ["NC", "New Caledonia"],
    ["NZ", "New Zealand"],
    ["NI", "Nicaragua"],
    ["NE", "Niger"],
    ["NG", "Nigeria"],
    ["NU", "Niue"],
    ["NF", "Norfolk Island"],
    ["KP", "North Korea"],
    ["MK", "North Macedonia"],
    ["MP", "Northern Mariana Islands"],
    ["NO", "Norway"],
    ["OM", "Oman"],
    ["PK", "Pakistan"],
    ["PW", "Palau"],
    ["PS", "Palestinian Territories"],
    ["PA", "Panama"],
    ["PG", "Papua New Guinea"],
    ["PY", "Paraguay"],
    ["PE", "Peru"],
    ["PH", "Philippines"],
    ["PN", "Pitcairn Islands"],
    ["PL", "Poland"],
    ["PT", "Portugal"],
    ["PR", "Puerto Rico"],
    ["QA", "Qatar"],
    ["RE", "Réunion"],
    ["RO", "Romania"],
    ["RU", "Russia"],
    ["RW", "Rwanda"],
    ["WS", "Samoa"],
    ["SM", "San Marino"],
    ["ST", "São Tomé & Príncipe"],
    ["SA", "Saudi Arabia"],
    ["SN", "Senegal"],
    ["RS", "Serbia"],
    ["SC", "Seychelles"],
    ["SL", "Sierra Leone"],
    ["SG", "Singapore"],
    ["SX", "Sint Maarten"],
    ["SK", "Slovakia"],
    ["SI", "Slovenia"],
    ["SB", "Solomon Islands"],
    ["SO", "Somalia"],
    ["ZA", "South Africa"],
    ["GS", "South Georgia & South Sandwich Islands"],
    ["KR", "South Korea"],
    ["SS", "South Sudan"],
    ["ES", "Spain"],
    ["LK", "Sri Lanka"],
    ["BL", "St. Barthélemy"],
    ["SH", "St. Helena"],
    ["KN", "St. Kitts & Nevis"],
    ["LC", "St. Lucia"],
    ["MF", "St. Martin"],
    ["PM", "St. Pierre & Miquelon"],
    ["VC", "St. Vincent & Grenadines"],
    ["SD", "Sudan"],
    ["SR", "Suriname"],
    ["SJ", "Svalbard & Jan Mayen"],
    ["SE", "Sweden"],
    ["CH", "Switzerland"],
    ["SY", "Syria"],
    ["TW", "Taiwan"],
    ["TJ", "Tajikistan"],
    ["TZ", "Tanzania"],
    ["TH", "Thailand"],
    ["TL", "Timor-Leste"],
    ["TG", "Togo"],
    ["TK", "Tokelau"],
    ["TO", "Tonga"],
    ["TT", "Trinidad & Tobago"],
    ["TN", "Tunisia"],
    ["TR", "Türkiye"],
    ["TM", "Turkmenistan"],
    ["TC", "Turks & Caicos Islands"],
    ["TV", "Tuvalu"],
    ["UM", "U.S. Outlying Islands"],
    ["VI", "U.S. Virgin Islands"],
    ["UG", "Uganda"],
    ["UA", "Ukraine"],
    ["AE", "United Arab Emirates"],
    ["GB", "United Kingdom"],
    ["US", "United States"],
    ["UY", "Uruguay"],
    ["UZ", "Uzbekistan"],
    ["VU", "Vanuatu"],
    ["VA", "Vatican City"],
    ["VE", "Venezuela"],
    ["VN", "Vietnam"],
    ["WF", "Wallis & Futuna"],
    ["EH", "Western Sahara"],
    ["YE", "Yemen"],
    ["ZM", "Zambia"],
    ["ZW", "Zimbabwe"],
  ];

  // What people type that is not the name. UK for GB is the important one: it
  // is a plausible code AND a plausible name, and it is neither.
  const ALIASES = {
    "uk": "GB", "great britain": "GB", "britain": "GB", "england": "GB",
    "scotland": "GB", "wales": "GB", "northern ireland": "GB",
    "usa": "US", "america": "US", "united states of america": "US",
    "holland": "NL", "the netherlands": "NL",
    "korea": "KR", "south korea": "KR", "north korea": "KP",
    "vietnam": "VN", "viet nam": "VN",
    "uae": "AE", "emirates": "AE",
    "czech republic": "CZ", "czechia": "CZ",
    "turkey": "TR",
    "russia": "RU", "ivory coast": "CI", "cape verde": "CV",
    "swaziland": "SZ", "macedonia": "MK", "burma": "MM",
    "east timor": "TL", "vatican": "VA", "vatican city": "VA",
  };

  const BY_CODE = new Map(LIST.map(([c, n]) => [c, n]));
  const isCode = (v) => BY_CODE.has(String(v || "").trim().toUpperCase());
  const nameOf = (v) => BY_CODE.get(String(v || "").trim().toUpperCase()) || null;

  // Match on NAME first and code second, so typing "IR" offers "IR — Iran"
  // rather than silently accepting it. The point is to make the choice visible.
  function search(term, limit = 8) {
    const q = String(term || "").trim().toLowerCase();
    if (!q) return [];
    const out = [];
    const push = (code) => { if (code && !out.some((x) => x.code === code)) out.push({ code, name: BY_CODE.get(code) }); };
    if (ALIASES[q]) push(ALIASES[q]);
    for (const [c, n] of LIST) if (n.toLowerCase().startsWith(q)) push(c);
    // An exact code comes BEFORE loose name matches: somebody typing "IE" means
    // Ireland, and burying it under French Southern Territories, Liechtenstein
    // and Sierra Leone — which merely contain the letters — would be absurd.
    if (q.length === 2 && isCode(q)) push(q.toUpperCase());
    for (const [c, n] of LIST) if (n.toLowerCase().includes(q)) push(c);
    for (const [k, c] of Object.entries(ALIASES)) if (k.startsWith(q)) push(c);
    return out.slice(0, limit);
  }

  // Split what somebody pasted into codes and the rest. The rest is the point:
  // it is reported, never dropped, because a code silently discarded is a
  // country silently not covered.
  function parse(text) {
    const parts = String(text || "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const codes = [], unknown = [];
    for (const p of parts) {
      const u = p.toUpperCase();
      if (isCode(u)) { if (!codes.includes(u)) codes.push(u); continue; }
      const hit = ALIASES[p.toLowerCase()] || (search(p, 1)[0] || {}).code;
      if (hit) { if (!codes.includes(hit)) codes.push(hit); continue; }
      unknown.push(p);
    }
    return { codes, unknown };
  }

  return { LIST, ALIASES, isCode, nameOf, search, parse, count: LIST.length };
})();
