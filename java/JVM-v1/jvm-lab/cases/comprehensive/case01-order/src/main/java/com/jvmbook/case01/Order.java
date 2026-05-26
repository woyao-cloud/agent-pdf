package com.jvmbook.case01;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record Order(
    String orderId,
    long userId,
    BigDecimal amount,
    int itemCount,
    Instant createdAt
) {
    public static Order create(long userId, BigDecimal amount, int itemCount) {
        return new Order(
            UUID.randomUUID().toString().substring(0, 8),
            userId, amount, itemCount, Instant.now()
        );
    }
}
