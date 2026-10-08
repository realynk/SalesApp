export function isNavActive(pathname: string, href: string) {
  if (href === "/leads") {
    return pathname === "/leads" || (pathname.startsWith("/leads/") && !pathname.startsWith("/leads/import"));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
