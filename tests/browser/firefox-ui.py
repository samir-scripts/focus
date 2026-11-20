"""Locate real Firefox controls through AT-SPI; activate with X11 input."""
import subprocess
import sys
import time

import pyatspi


def x11(*args):
    subprocess.run(("xdotool", *args), check=True, stdout=subprocess.DEVNULL)


def find(role, names):
    desktop = pyatspi.Registry.getDesktop(0)
    stack = [desktop[i] for i in range(desktop.childCount)
             if "firefox" in desktop[i].name.lower()]
    while stack:
        node = stack.pop()
        try:
            state = node.getState()
            if node.getRoleName() == role and node.name.strip() in names and state.contains(pyatspi.STATE_VISIBLE):
                return node
            stack.extend(node[i] for i in range(node.childCount - 1, -1, -1))
        except (LookupError, RuntimeError):
            continue
    return None


def click(node):
    component = node.queryComponent()
    try:
        component.scrollTo(pyatspi.SCROLL_ANYWHERE)
    except (AttributeError, NotImplementedError):
        component.grabFocus()
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if node.getState().contains(pyatspi.STATE_SHOWING):
            ext = component.getExtents(pyatspi.DESKTOP_COORDS)
            if ext.x >= 0 and ext.y >= 0 and ext.width > 0 and ext.height > 0:
                x11("mousemove", str(ext.x + ext.width // 2), str(ext.y + ext.height // 2), "click", "1")
                return
        time.sleep(0.1)
    raise RuntimeError("Firefox control is outside the X11 viewport")


action, role, name, *args = sys.argv[1:]
deadline = time.monotonic() + 12
while time.monotonic() < deadline:
    node = find(role, name.split("|"))
    if node is not None:
        if action == "wait":
            sys.exit(0)
        if action != "check" or not node.getState().contains(pyatspi.STATE_CHECKED):
            click(node)
        if action == "fill":
            x11("key", "ctrl+a")
            x11("type", "--clearmodifiers", "--", args[0])
        sys.exit(0)
    time.sleep(0.2)
raise SystemExit(f"Firefox accessibility control not found: {role}, {name}")
