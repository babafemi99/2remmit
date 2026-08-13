"use client";

import { House } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ConsoleHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/" || pathname === "/transfers";

  return (
    <header className="console-header">
      <Link href="/" aria-label="2Remit home" className="brand-link">
        <Image
          src="/brand/logo.svg"
          alt="2Remit"
          width={520}
          height={180}
          className="brand-logo"
          priority
        />
      </Link>
      <nav className="console-navigation" aria-label="Console navigation">
        {!isHome ? (
          <Link href="/transfers" className="home-link">
            <House aria-hidden="true" size={17} weight="bold" />
            <span>Home</span>
          </Link>
        ) : null}
        {pathname !== "/dev" ? (
          <Link
            href="/dev"
            className="developer-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Developer</span>
            <span className="demo-badge">Demo</span>
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
