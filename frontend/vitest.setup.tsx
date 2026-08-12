import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

export function getNavigationMocks() {
  return navigationMocks;
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => navigationMocks,
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("lottie-react", () => ({
  default: ({ autoplay }: { autoplay?: boolean }) => (
    <div data-testid="lottie" data-autoplay={String(autoplay)} />
  ),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();

HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
