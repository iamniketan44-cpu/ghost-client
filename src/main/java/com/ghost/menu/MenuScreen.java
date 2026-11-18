package com.ghost.menu;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;

/**
 * In-game menu. Input (click, Right Shift, scroll keys) is read straight from GLFW,
 * so it does not depend on the Screen input method signatures that change between versions.
 */
public class MenuScreen extends Screen {
    private static final int TOP = 30;
    private static final int MARGIN = 24;
    private static final int GAP = 6;
    private static final int TILE_H = 28;
    private static final int COLS = 3;

    private double scroll = 0;
    private int contentH = 0;
    private boolean prevMouse;
    private boolean prevShift;
    private boolean prevUp;
    private boolean prevDown;

    private record Tile(Config.Mod mod, int x, int y, int w, int h) {}
    private record Header(String text, int y) {}

    private final List<Tile> tiles = new ArrayList<>();
    private final List<Header> headers = new ArrayList<>();

    public MenuScreen() {
        super(Text.literal("Ghost Menu"));
        long w = MinecraftClient.getInstance().getWindow().getHandle();
        prevShift = GLFW.glfwGetKey(w, GLFW.GLFW_KEY_RIGHT_SHIFT) == GLFW.GLFW_PRESS;
        prevMouse = GLFW.glfwGetMouseButton(w, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    private void layout() {
        tiles.clear();
        headers.clear();
        int tileW = (width - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
        int y = TOP + 6 - (int) scroll;
        int col = 0;
        String last = null;
        for (Config.Mod m : Config.MODS) {
            if (!m.section().equals(last)) {
                if (col != 0) {
                    y += TILE_H + GAP;
                    col = 0;
                }
                if (last != null) y += 6;
                headers.add(new Header(m.section(), y));
                y += 14;
                last = m.section();
            }
            int x = MARGIN + col * (tileW + GAP);
            tiles.add(new Tile(m, x, y, tileW, TILE_H));
            col++;
            if (col == COLS) {
                col = 0;
                y += TILE_H + GAP;
            }
        }
        if (col != 0) y += TILE_H + GAP;
        contentH = y + (int) scroll - TOP;
    }

    private void poll(int mouseX, int mouseY) {
        long w = MinecraftClient.getInstance().getWindow().getHandle();

        boolean shift = GLFW.glfwGetKey(w, GLFW.GLFW_KEY_RIGHT_SHIFT) == GLFW.GLFW_PRESS;
        if (shift && !prevShift) {
            MinecraftClient.getInstance().setScreen(null);
            return;
        }
        prevShift = shift;

        double max = Math.max(0, contentH - (height - TOP) + 10);
        boolean up = GLFW.glfwGetKey(w, GLFW.GLFW_KEY_UP) == GLFW.GLFW_PRESS;
        boolean down = GLFW.glfwGetKey(w, GLFW.GLFW_KEY_DOWN) == GLFW.GLFW_PRESS;
        if (up) scroll = Math.max(0, scroll - 4);
        if (down) scroll = Math.min(max, scroll + 4);

        boolean mouse = GLFW.glfwGetMouseButton(w, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        if (mouse && !prevMouse && mouseY >= TOP) {
            for (Tile t : tiles) {
                if (mouseX >= t.x() && mouseX < t.x() + t.w() && mouseY >= t.y() && mouseY < t.y() + t.h()) {
                    Config.toggle(t.mod().id());
                    break;
                }
            }
        }
        prevMouse = mouse;
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        layout();
        poll(mouseX, mouseY);
        if (MinecraftClient.getInstance().currentScreen != this) return;

        ctx.fill(0, 0, width, height, 0xCC0F0F14);

        ctx.enableScissor(0, TOP, width, height);
        for (Header h : headers) {
            ctx.drawText(textRenderer, h.text(), MARGIN, h.y(), 0xFF8A8A9B, false);
        }
        for (Tile t : tiles) {
            boolean on = Config.isOn(t.mod().id());
            boolean hover = mouseX >= t.x() && mouseX < t.x() + t.w()
                && mouseY >= t.y() && mouseY < t.y() + t.h() && mouseY >= TOP;
            int bg = on ? 0xFF1D3A28 : (hover ? 0xFF23232E : 0xFF1A1A23);
            int border = on ? 0xFF4ADE80 : 0xFF2A2A36;
            ctx.fill(t.x(), t.y(), t.x() + t.w(), t.y() + t.h(), border);
            ctx.fill(t.x() + 1, t.y() + 1, t.x() + t.w() - 1, t.y() + t.h() - 1, bg);
            ctx.drawText(textRenderer, t.mod().name(), t.x() + 10, t.y() + (t.h() - 8) / 2, 0xFFF2F2F7, false);

            int sx = t.x() + t.w() - 36;
            int sy = t.y() + (t.h() - 12) / 2;
            ctx.fill(sx, sy, sx + 26, sy + 12, on ? 0xFF4ADE80 : 0xFF3A3A48);
            int kx = on ? sx + 15 : sx + 2;
            ctx.fill(kx, sy + 2, kx + 9, sy + 10, 0xFFFFFFFF);
        }
        ctx.disableScissor();

        ctx.fill(0, 0, width, TOP, 0xFF0F0F14);
        ctx.drawText(textRenderer, "GHOST MENU", MARGIN, 11, 0xFF4ADE80, true);
        String hint = "Right Shift / ESC = close   |   Up/Down = scroll";
        ctx.drawText(textRenderer, hint, width - MARGIN - textRenderer.getWidth(hint), 11, 0xFF8A8A9B, false);
    }
}
