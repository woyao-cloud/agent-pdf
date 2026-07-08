-- ============================================================
-- 分片初始化脚本（两个分片执行相同的建表语句）
-- ============================================================

CREATE TABLE t_order (
    order_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    product_name VARCHAR(100),
    amount DECIMAL(10,2),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE t_order_item (
    item_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL,
    product_name VARCHAR(100),
    price DECIMAL(10,2),
    quantity INT,
    PRIMARY KEY (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 广播表（每个分片都有完整数据）
CREATE TABLE t_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(100) NOT NULL,
    config_value VARCHAR(500),
    UNIQUE KEY uk_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO t_config (config_key, config_value) VALUES
('max_order_amount', '100000'),
('min_order_amount', '1'),
('free_shipping_threshold', '99');
