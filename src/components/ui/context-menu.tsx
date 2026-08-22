"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

type MenuContextValue = {
  open: boolean;
  close: () => void;
  openMenu: (point: Point, anchor: HTMLElement) => void;
  point: Point | null;
  anchor: HTMLElement | null;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext(): MenuContextValue {
  const context = useContext(MenuContext);
  if (context === null) {
    throw new Error(
      "ContextMenu compound components must be rendered inside a <ContextMenu>",
    );
  }
  return context;
}

type SubMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerEl: HTMLElement | null;
  setTriggerEl: (element: HTMLElement | null) => void;
};

const SubMenuContext = createContext<SubMenuContextValue | null>(null);

function useSubMenuContext(): SubMenuContextValue {
  const context = useContext(SubMenuContext);
  if (context === null) {
    throw new Error(
      "ContextMenuSub components must be rendered inside a <ContextMenuSub>",
    );
  }
  return context;
}

type SubmenuControllerValue = {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
};

const SubmenuControllerContext = createContext<SubmenuControllerValue | null>(
  null,
);

function useCloseSiblingSubmenus(): () => void {
  const controller = useContext(SubmenuControllerContext);
  return useCallback(() => {
    controller?.setActiveId(null);
  }, [controller]);
}

function SubmenuControllerScope({ children }: { children?: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const value = useMemo<SubmenuControllerValue>(
    () => ({ activeId, setActiveId }),
    [activeId],
  );
  return (
    <SubmenuControllerContext.Provider value={value}>
      {children}
    </SubmenuControllerContext.Provider>
  );
}

const POPUP_CLASS = cn(
  "fixed z-50 flex min-w-32 flex-col rounded-lg border bg-popover not-dark:bg-clip-padding p-1 text-popover-foreground shadow-lg/5 outline-none",
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
);

const MENU_ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

const MENU_ITEM_CLASS = cn(
  "flex min-h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1 text-base text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground sm:min-h-7 sm:text-sm",
  "[&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-4.5 sm:[&>svg:not([class*='size-'])]:size-4 [&>svg]:pointer-events-none [&>svg:not(:last-child)]:-mx-0.5 [&>svg]:shrink-0",
);

function moveItemFocus(
  container: HTMLElement,
  direction: "next" | "previous" | "first" | "last",
) {
  const items = Array.from(
    container.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR),
  ).filter((element) => !element.hasAttribute("aria-disabled"));
  if (items.length === 0) {
    return;
  }
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex = currentIndex;
  if (direction === "next") {
    nextIndex = (currentIndex + 1) % items.length;
  } else if (direction === "previous") {
    nextIndex = (currentIndex - 1 + items.length) % items.length;
  } else if (direction === "first") {
    nextIndex = 0;
  } else if (direction === "last") {
    nextIndex = items.length - 1;
  }
  items[nextIndex]?.focus();
}

function handleMenuKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  onClose?: () => void,
) {
  if (container === null) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    onClose?.();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveItemFocus(container, "next");
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveItemFocus(container, "previous");
  } else if (event.key === "Home") {
    event.preventDefault();
    moveItemFocus(container, "first");
  } else if (event.key === "End") {
    event.preventDefault();
    moveItemFocus(container, "last");
  }
}

export function ContextMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [point, setPoint] = useState<Point | null>(null);

  const open = openProp ?? internalOpen;

  const setOpen = useCallback(
    (value: boolean) => {
      if (openProp === undefined) {
        setInternalOpen(value);
      }
      onOpenChange?.(value);
    },
    [openProp, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  const openMenu = useCallback(
    (nextPoint: Point, nextAnchor: HTMLElement) => {
      setAnchor(nextAnchor);
      setPoint(nextPoint);
      setOpen(true);
    },
    [setOpen],
  );

  const value = useMemo(
    () => ({ open, close, openMenu, point, anchor }),
    [open, close, openMenu, point, anchor],
  );

  return (
    <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
  );
}

export function ContextMenuTrigger({
  className,
  children,
  onContextMenu,
  ...props
}: React.ComponentProps<"div">) {
  const { openMenu } = useMenuContext();

  return (
    <div
      className={className}
      data-slot="context-menu-trigger"
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
        openMenu(
          { x: event.clientX, y: event.clientY },
          event.currentTarget,
        );
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function ContextMenuContent({
  className,
  children,
  sideOffset = 4,
  ...props
}: {
  className?: string;
  children?: React.ReactNode;
  sideOffset?: number;
}) {
  const { open, close, point } = useMenuContext();
  const popupRef = useRef<HTMLDivElement>(null);

  const start = point ?? { x: 0, y: 0 };

  useLayoutEffect(() => {
    const element = popupRef.current;
    if (!open || element === null) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;
    const margin = 8;
    let nextX = start.x;
    let nextY = start.y + sideOffset;
    if (rect.width > 0) {
      if (nextX + rect.width > innerWidth - margin) {
        nextX = Math.max(margin, innerWidth - rect.width - margin);
      }
      if (nextX < margin) {
        nextX = margin;
      }
      if (nextY + rect.height > innerHeight - margin) {
        nextY = Math.max(margin, innerHeight - rect.height - margin);
      }
      if (nextY < margin) {
        nextY = margin;
      }
    }
    element.style.left = `${nextX}px`;
    element.style.top = `${nextY}px`;
  }, [open, start.x, start.y, sideOffset]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const element = popupRef.current;
      if (element !== null && element.contains(event.target as Node)) {
        return;
      }
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const handleResize = () => close();
    const handleBlur = () => close();

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleResize);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("blur", handleBlur);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) {
      popupRef.current?.focus();
    }
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popupRef}
          role="menu"
          tabIndex={-1}
          data-slot="context-menu-popup"
          className={cn(POPUP_CLASS, className)}
          style={{ transformOrigin: "top left" }}
          initial={{ opacity: 0, scale: 0.9, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
          transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => handleMenuKeyDown(event, popupRef.current, close)}
          {...props}
        >
          <SubmenuControllerScope>{children}</SubmenuControllerScope>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ContextMenuGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      className={className}
      data-slot="context-menu-group"
      {...props}
    >
      {children}
    </div>
  );
}

export function ContextMenuGroupLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"p"> & {
  inset?: boolean;
}) {
  return (
    <p
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground",
        inset && "ps-9 sm:ps-8",
        className,
      )}
      data-inset={inset}
      data-slot="context-menu-label"
      {...props}
    />
  );
}

export function ContextMenuItem({
  className,
  inset,
  variant = "default",
  disabled = false,
  onClick,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "onClick"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
  disabled?: boolean;
  onClick?: (
    event:
      | React.MouseEvent<HTMLDivElement>
      | React.KeyboardEvent<HTMLDivElement>,
    anchor: HTMLElement | null,
  ) => void;
}) {
  const { close, anchor } = useMenuContext();
  const closeSiblingSubmenus = useCloseSiblingSubmenus();

  return (
    <div
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      data-inset={inset}
      data-slot="context-menu-item"
      data-variant={variant}
      aria-disabled={disabled || undefined}
      className={cn(
        MENU_ITEM_CLASS,
        inset && "ps-8",
        variant === "destructive" &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onMouseEnter={closeSiblingSubmenus}
      onClick={(event) => {
        if (disabled) {
          return;
        }
        onClick?.(event, anchor);
        close();
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.(event, anchor);
          close();
        }
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function ContextMenuLinkItem({
  className,
  inset,
  variant = "default",
  closeOnClick = true,
  disabled = false,
  href,
  onClick,
  children,
  ...props
}: Omit<React.ComponentProps<"a">, "onClick"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
  closeOnClick?: boolean;
  disabled?: boolean;
  onClick?: (
    event: React.MouseEvent<HTMLAnchorElement>,
    anchor: HTMLElement | null,
  ) => void;
}) {
  const { close, anchor } = useMenuContext();
  const closeSiblingSubmenus = useCloseSiblingSubmenus();

  return (
    <a
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      href={disabled ? undefined : href}
      data-inset={inset}
      data-slot="context-menu-link-item"
      data-variant={variant}
      aria-disabled={disabled || undefined}
      className={cn(
        MENU_ITEM_CLASS,
        inset && "ps-8",
        variant === "destructive" &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onMouseEnter={closeSiblingSubmenus}
      onClick={(event) => {
        if (disabled) {
          return;
        }
        onClick?.(event, anchor);
        if (closeOnClick) {
          close();
        }
      }}
      {...props}
    >
      {children}
    </a>
  );
}

export function ContextMenuCheckboxItem({
  className,
  children,
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  variant = "default",
  ...props
}: Omit<React.ComponentProps<"div">, "onClick"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  variant?: "default" | "switch";
}) {
  const { close } = useMenuContext();
  const closeSiblingSubmenus = useCloseSiblingSubmenus();
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checkedProp !== undefined;
  const checked = isControlled ? checkedProp : internalChecked;

  const handleToggle = () => {
    const next = !checked;
    if (!isControlled) {
      setInternalChecked(next);
    }
    onCheckedChange?.(next);
  };

  return (
    <div
      role="menuitemcheckbox"
      tabIndex={disabled ? -1 : 0}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      data-slot="context-menu-checkbox-item"
      className={cn(
        "grid min-h-8 cursor-default select-none items-center gap-2 rounded-sm py-1 ps-2 text-base text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground sm:min-h-7 sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        variant === "switch"
          ? "grid-cols-[1fr_auto] gap-4 pe-1.5"
          : "grid-cols-[.75rem_1fr] pe-4",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onMouseEnter={closeSiblingSubmenus}
      onClick={() => {
        if (disabled) {
          return;
        }
        handleToggle();
        close();
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
          close();
        }
      }}
      {...props}
    >
      {variant === "switch" ? (
        <>
          <span className="col-start-1">{children}</span>
          <span
            className={cn(
              "inline-flex h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)] shrink-0 items-center rounded-full bg-input p-px transition-colors [--thumb-size:--spacing(4)] sm:[--thumb-size:--spacing(3)]",
              checked && "bg-primary",
            )}
          >
            <span
              className={cn(
                "block aspect-square h-full rounded-full bg-background shadow-sm transition-transform",
                checked && "translate-x-[calc(var(--thumb-size)-4px)]",
              )}
            />
          </span>
        </>
      ) : (
        <>
          <CheckIcon
            className={cn(
              "col-start-1 -ms-0.5 size-4",
              checked ? "opacity-100" : "opacity-0",
            )}
          />
          <span className="col-start-2">{children}</span>
        </>
      )}
    </div>
  );
}

type RadioContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const RadioContext = createContext<RadioContextValue | null>(null);

export function ContextMenuRadioGroup({
  className,
  value,
  onValueChange,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const context = useMemo(
    () => ({ value, onValueChange }),
    [value, onValueChange],
  );

  return (
    <RadioContext.Provider value={context}>
      <div
        role="radiogroup"
        className={className}
        data-slot="context-menu-radio-group"
        {...props}
      >
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export function ContextMenuRadioItem({
  className,
  children,
  value,
  disabled = false,
  ...props
}: React.ComponentProps<"div"> & {
  value: string;
  disabled?: boolean;
}) {
  const { close } = useMenuContext();
  const closeSiblingSubmenus = useCloseSiblingSubmenus();
  const radio = useContext(RadioContext);
  const checked = radio?.value === value;

  return (
    <div
      role="menuitemradio"
      tabIndex={disabled ? -1 : 0}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      data-slot="context-menu-radio-item"
      className={cn(
        "grid min-h-8 cursor-default select-none grid-cols-[.75rem_1fr] items-center gap-2 rounded-sm py-1 ps-2 pe-4 text-base text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground sm:min-h-7 sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onMouseEnter={closeSiblingSubmenus}
      onClick={() => {
        if (disabled) {
          return;
        }
        radio?.onValueChange(value);
        close();
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          radio?.onValueChange(value);
          close();
        }
      }}
      {...props}
    >
      <CheckIcon
        className={cn(
          "col-start-1 -ms-0.5 size-4",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="col-start-2">{children}</span>
    </div>
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      className={cn("mx-2 my-1 h-px bg-border", className)}
      data-slot="context-menu-separator"
      {...props}
    />
  );
}

export function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "ms-auto font-sans text-xs font-medium tracking-widest text-muted-foreground/72",
        className,
      )}
      data-slot="context-menu-shortcut"
      {...props}
    />
  );
}

export function ContextMenuSub({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const id = useId();
  const controller = useContext(SubmenuControllerContext);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);

  const isControlled = openProp !== undefined;
  const open = isControlled
    ? openProp
    : controller !== null
      ? controller.activeId === id
      : internalOpen;

  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) {
        if (controller !== null) {
          if (value) {
            controller.setActiveId(id);
          } else if (controller.activeId === id) {
            controller.setActiveId(null);
          }
        } else {
          setInternalOpen(value);
        }
      }
      onOpenChange?.(value);
    },
    [isControlled, controller, id, onOpenChange],
  );

  const value = useMemo(
    () => ({ open, setOpen, triggerEl, setTriggerEl }),
    [open, setOpen, triggerEl, setTriggerEl],
  );

  return (
    <SubMenuContext.Provider value={value}>
      {children}
    </SubMenuContext.Provider>
  );
}

export function ContextMenuSubTrigger({
  className,
  inset,
  disabled = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
  disabled?: boolean;
}) {
  const { open, setOpen, setTriggerEl } = useSubMenuContext();
  const refCallback = useCallback(
    (element: HTMLDivElement | null) => {
      setTriggerEl(element);
    },
    [setTriggerEl],
  );

  return (
    <div
      ref={refCallback}
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-disabled={disabled || undefined}
      data-inset={inset}
      data-slot="context-menu-sub-trigger"
      className={cn(
        MENU_ITEM_CLASS,
        inset && "ps-8",
        open && "bg-accent text-accent-foreground",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onMouseEnter={() => {
        if (!disabled) {
          setOpen(true);
        }
      }}
      onClick={() => {
        if (!disabled) {
          setOpen(true);
        }
      }}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto -me-0.5 size-4 opacity-80" />
    </div>
  );
}

export function ContextMenuSubPopup({
  className,
  children,
  sideOffset = 4,
  alignOffset = -5,
  ...props
}: {
  className?: string;
  children?: React.ReactNode;
  sideOffset?: number;
  alignOffset?: number;
}) {
  const submenu = useSubMenuContext();
  const { close } = useMenuContext();
  const popupRef = useRef<HTMLDivElement>(null);

  const open = submenu.open;

  useLayoutEffect(() => {
    const element = popupRef.current;
    if (!open || element === null || submenu.triggerEl === null) {
      return;
    }
    const triggerRect = submenu.triggerEl.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;
    const margin = 8;
    let nextX = triggerRect.right + sideOffset;
    let nextY = triggerRect.top + alignOffset;
    element.style.left = `${nextX}px`;
    element.style.top = `${nextY}px`;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0) {
      if (nextX + rect.width > innerWidth - margin) {
        nextX = Math.max(margin, innerWidth - rect.width - margin);
      }
      if (nextX < margin) {
        nextX = margin;
      }
      if (nextY + rect.height > innerHeight - margin) {
        nextY = Math.max(margin, innerHeight - rect.height - margin);
      }
      if (nextY < margin) {
        nextY = margin;
      }
    }
    element.style.left = `${nextX}px`;
    element.style.top = `${nextY}px`;
  }, [open, submenu.triggerEl, sideOffset, alignOffset]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const element = popupRef.current;
      if (element !== null && element.contains(event.target as Node)) {
        return;
      }
      if (
        submenu.triggerEl !== null &&
        submenu.triggerEl.contains(event.target as Node)
      ) {
        return;
      }
      submenu.setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, submenu, close]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popupRef}
          role="menu"
          tabIndex={-1}
          data-slot="context-menu-sub-popup"
          className={cn(POPUP_CLASS, className)}
          style={{ transformOrigin: "top left" }}
          initial={{ opacity: 0, scale: 0.9, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) =>
            handleMenuKeyDown(event, popupRef.current, close)
          }
          {...props}
        >
          <SubmenuControllerScope>{children}</SubmenuControllerScope>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export { ContextMenuContent as ContextMenuPopup };
export { ContextMenuSubPopup as ContextMenuSubContent };