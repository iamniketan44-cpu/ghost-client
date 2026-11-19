package com.ghost.menu;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.item.ItemStack;
import org.lwjgl.glfw.GLFW;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

public final class Hud {
    private static final ArrayDeque<Long> LEFT = new ArrayDeque<>();
    private static final ArrayDeque<Long> RIGHT = new ArrayDeque<>();
    private static final long START = System.currentTimeMillis();
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm");

    private static boolean prevLeft, prevRight, fbWasOn, prevShift, sprintWasOn;
    private static double lastX, lastZ;
    private static int prevHurt, tickCount;
    private static double speed;
    public static int combo;
    private static final EquipmentSlot[] ARMOR_SLOTS =
        {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

    static void tick(MinecraftClient c) {
        long now = System.currentTimeMillis();
        long window = c.getWindow().getHandle();

        boolean rs = GLFW.glfwGetKey(window, GLFW.GLFW_KEY_RIGHT_SHIFT) == GLFW.GLFW_PRESS;
        if (rs && !prevShift && c.currentScreen == null && c.player != null) {
            c.setScreen(new MenuScreen());
        }
        prevShift = rs;

        boolean l = GLFW.glfwGetMouseButton(window, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean r = GLFW.glfwGetMouseButton(window, GLFW.GLFW_MOUSE_BUTTON_RIGHT) == GLFW.GLFW_PRESS;
        if (c.currentScreen == null) {
            if (l && !prevLeft) LEFT.addLast(now);
            if (r && !prevRight) RIGHT.addLast(now);
        }
        prevLeft = l;
        prevRight = r;
        while (!LEFT.isEmpty() && now - LEFT.peekFirst() > 1000) LEFT.pollFirst();
        while (!RIGHT.isEmpty() && now - RIGHT.peekFirst() > 1000) RIGHT.pollFirst();

        ClientPlayerEntity p = c.player;
        if (p == null) {
            combo = 0;
            return;
        }

        // Toggle Sprint: aage badhte hi apne aap sprint
        boolean sp = Config.isOn("sprint");
        if (sp && c.currentScreen == null && c.options.forwardKey.isPressed()) {
            c.options.sprintKey.setPressed(true);
        }
        if (!sp && sprintWasOn) {
            c.options.sprintKey.setPressed(false);
        }
        sprintWasOn = sp;

        double dx = p.getX() - lastX;
        double dz = p.getZ() - lastZ;
        speed = Math.sqrt(dx * dx + dz * dz) * 20.0;
        lastX = p.getX();
        lastZ = p.getZ();

        if (p.hurtTime > 0 && prevHurt == 0) combo = 0;
        prevHurt = p.hurtTime;

        boolean fb = Config.isOn("fullbright");
        if (fb && tickCount % 100 == 0) {
            p.addStatusEffect(new StatusEffectInstance(StatusEffects.NIGHT_VISION, 1000, 0, false, false, false));
        }
        if (!fb && fbWasOn) {
            p.removeStatusEffect(StatusEffects.NIGHT_VISION);
        }
        fbWasOn = fb;
        tickCount++;
    }

    static void render(DrawContext ctx) {
        MinecraftClient c = MinecraftClient.getInstance();
        ClientPlayerEntity p = c.player;
        if (c.options.hudHidden || p == null || c.world == null) return;

        List<String> lines = new ArrayList<>();
        if (Config.isOn("fps")) lines.add("FPS: " + c.getCurrentFps());
        if (Config.isOn("ping")) {
            PlayerListEntry e = c.getNetworkHandler() != null
                ? c.getNetworkHandler().getPlayerListEntry(p.getUuid()) : null;
            lines.add("Ping: " + (e != null ? e.getLatency() + " ms" : "-"));
        }
        if (Config.isOn("coords")) {
            lines.add("XYZ: " + p.getBlockX() + " " + p.getBlockY() + " " + p.getBlockZ());
        }
        if (Config.isOn("direction")) {
            String d = p.getHorizontalFacing().asString();
            lines.add("Direction: " + Character.toUpperCase(d.charAt(0)) + d.substring(1));
        }
        if (Config.isOn("clock")) lines.add("Time: " + LocalTime.now().format(CLOCK));
        if (Config.isOn("memory")) {
            Runtime rt = Runtime.getRuntime();
            long used = (rt.totalMemory() - rt.freeMemory()) / 1048576L;
            lines.add("Memory: " + used + " / " + (rt.maxMemory() / 1048576L) + " MB");
        }
        if (Config.isOn("server")) {
            lines.add("Server: " + (c.getCurrentServerEntry() != null ? c.getCurrentServerEntry().address : "Singleplayer"));
        }
        if (Config.isOn("day")) lines.add("Day: " + (c.world.getTimeOfDay() / 24000L));
        if (Config.isOn("playtime")) lines.add("Playtime: " + ((System.currentTimeMillis() - START) / 60000L) + " min");
        if (Config.isOn("speed")) lines.add(String.format("Speed: %.1f b/s", speed));
        if (Config.isOn("cps")) lines.add("CPS: " + LEFT.size() + " | " + RIGHT.size());
        if (Config.isOn("combo")) lines.add("Combo: " + combo);
        if (Config.isOn("sprint")) lines.add(p.isSprinting() ? "[Sprinting (Toggled)]" : "[Sprint: Toggled]");

        int x = 6;
        int y = 6;
        for (String s : lines) {
            int w = c.textRenderer.getWidth(s);
            ctx.fill(x - 2, y - 2, x + w + 2, y + 10, 0x90000000);
            ctx.drawText(c.textRenderer, s, x, y, 0xFFFFFFFF, true);
            y += 14;
        }

        if (Config.isOn("armor")) {
            y += 4;
            for (EquipmentSlot slot : ARMOR_SLOTS) {
                ItemStack st = p.getEquippedStack(slot);
                if (st.isEmpty()) continue;
                ctx.drawItem(st, x, y);
                if (st.isDamageable()) {
                    int left = st.getMaxDamage() - st.getDamage();
                    ctx.drawText(c.textRenderer, String.valueOf(left), x + 20, y + 4, 0xFFFFFFFF, true);
                }
                y += 18;
            }
        }

        if (Config.isOn("potions")) {
            y += 4;
            for (StatusEffectInstance ef : p.getStatusEffects()) {
                // Fullbright ka apna night vision list mein na dikhe
                if (Config.isOn("fullbright") && ef.getEffectType().equals(StatusEffects.NIGHT_VISION)) continue;
                String name = ef.getEffectType().value().getName().getString();
                int amp = ef.getAmplifier();
                int d = ef.getDuration();
                String time = d < 0 ? "**" : String.format("%d:%02d", d / 1200, (d / 20) % 60);
                String s = name + (amp > 0 ? " " + roman(amp + 1) : "") + "  " + time;
                int w = c.textRenderer.getWidth(s);
                ctx.fill(x - 2, y - 2, x + w + 2, y + 10, 0x90000000);
                ctx.drawText(c.textRenderer, s, x, y, 0xFFFFFFFF, true);
                y += 14;
            }
        }

        if (Config.isOn("keystrokes")) {
            boolean mouse = Config.isOn("mousekeys");
            int bx = 10;
            int by = ctx.getScaledWindowHeight() - (mouse ? 86 : 60);
            key(ctx, c, bx + 24, by, "W", c.options.forwardKey.isPressed());
            key(ctx, c, bx, by + 24, "A", c.options.leftKey.isPressed());
            key(ctx, c, bx + 24, by + 24, "S", c.options.backKey.isPressed());
            key(ctx, c, bx + 48, by + 24, "D", c.options.rightKey.isPressed());
            if (mouse) {
                key(ctx, c, bx, by + 48, 35, "LMB", prevLeft);
                key(ctx, c, bx + 37, by + 48, 35, "RMB", prevRight);
            }
        }
    }

    private static String roman(int n) {
        String[] r = {"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"};
        return n >= 0 && n < r.length ? r[n] : String.valueOf(n);
    }

    private static void key(DrawContext ctx, MinecraftClient c, int x, int y, String label, boolean down) {
        key(ctx, c, x, y, 22, label, down);
    }

    private static void key(DrawContext ctx, MinecraftClient c, int x, int y, int w, String label, boolean down) {
        ctx.fill(x, y, x + w, y + 22, down ? 0xB0FFFFFF : 0x90000000);
        int tw = c.textRenderer.getWidth(label);
        ctx.drawText(c.textRenderer, label, x + (w - tw) / 2, y + 7, down ? 0xFF000000 : 0xFFFFFFFF, false);
    }
}
