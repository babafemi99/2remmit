import Image from "next/image";
import Link from "next/link";

export function ConsoleHeader() {
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
      <Link href="/dev" className="developer-link">
        <span>Developer</span>
        <span className="demo-badge">Demo</span>
      </Link>
    </header>
  );
}
