package com.ghost.menu;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Identifier;

public class GhostMenuClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        Config.load();

        ClientTickEvents.END_CLIENT_TICK.register(Hud::tick);

        HudElementRegistry.attachElementBefore(
            VanillaHudElements.CHAT,
            Identifier.of("ghostmenu", "hud"),
            (ctx, tickCounter) -> Hud.render(ctx));

        AttackEntityCallback.EVENT.register((player, world, hand, entity, hit) -> {
            if (player instanceof ClientPlayerEntity && entity instanceof LivingEntity) {
                Hud.combo++;
            }
            return ActionResult.PASS;
        });
    }
}
