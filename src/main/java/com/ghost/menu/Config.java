package com.ghost.menu;

import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Properties;

public final class Config {
    public record Mod(String id, String name, String section) {}

    public static final List<Mod> MODS = List.of(
        new Mod("fps", "FPS", "INFO"),
        new Mod("ping", "Ping", "INFO"),
        new Mod("coords", "Coordinates", "INFO"),
        new Mod("direction", "Direction", "INFO"),
        new Mod("clock", "Clock", "INFO"),
        new Mod("memory", "Memory", "INFO"),
        new Mod("server", "Server Address", "INFO"),
        new Mod("day", "Day Counter", "INFO"),
        new Mod("playtime", "Playtime", "INFO"),
        new Mod("speed", "Speed", "INFO"),
        new Mod("cps", "CPS", "COMBAT"),
        new Mod("combo", "Combo", "COMBAT"),
        new Mod("keystrokes", "Keystrokes", "COMBAT"),
        new Mod("armor", "Armor Status", "COMBAT"),
        new Mod("potions", "Potion Effects", "COMBAT"),
        new Mod("mousekeys", "Mouse Buttons (Keystrokes)", "COMBAT"),
        new Mod("fullbright", "Fullbright", "WORLD"),
        new Mod("sprint", "Toggle Sprint", "WORLD")
    );

    private static final Properties PROPS = new Properties();

    private static Path path() {
        return FabricLoader.getInstance().getConfigDir().resolve("ghostmenu.properties");
    }

    public static void load() {
        PROPS.clear();
        Path p = path();
        if (Files.exists(p)) {
            try (InputStream in = Files.newInputStream(p)) {
                PROPS.load(in);
            } catch (IOException ignored) {
            }
        } else {
            PROPS.setProperty("fps", "true");
            PROPS.setProperty("cps", "true");
            save();
        }
    }

    public static void save() {
        try (OutputStream out = Files.newOutputStream(path())) {
            PROPS.store(out, "Ghost Menu");
        } catch (IOException ignored) {
        }
    }

    public static boolean isOn(String id) {
        return "true".equals(PROPS.getProperty(id, "false"));
    }

    public static void toggle(String id) {
        PROPS.setProperty(id, isOn(id) ? "false" : "true");
        save();
    }
}
