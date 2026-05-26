import dns from "dns/promises";
import ipaddr from "ipaddr.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

function isPrivateIp(ip: string) {
  try {
    const addr = ipaddr.parse(ip);
    const range = addr.range();
    return (
      range === "private" ||
      range === "loopback" ||
      range === "linkLocal" ||
      range === "uniqueLocal" ||
      range === "unspecified" ||
      range === "carrierGradeNat" ||
      range === "broadcast" ||
      range === "multicast" ||
      range === "reserved"
    );
  } catch {
    return true;
  }
}

export async function assertSafeHttpUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL 格式不正确");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("仅支持 http/https URL");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("不允许访问本机地址");
  }

  // 如果是直接IP
  if (ipaddr.isValid(hostname) && isPrivateIp(hostname)) {
    throw new Error("不允许访问内网 IP");
  }

  // 域名解析到的IP也必须安全
  const lookups = await dns.lookup(hostname, { all: true });
  for (const item of lookups) {
    if (isPrivateIp(item.address)) {
      throw new Error("域名解析到内网 IP，已阻止访问");
    }
  }

  return url;
}

