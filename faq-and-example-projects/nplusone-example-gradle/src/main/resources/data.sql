INSERT INTO regions (id, name) VALUES
    (1, 'Europe'),
    (2, 'North America');

INSERT INTO departments (id, name, region_id) VALUES
    (1, 'Engineering', 1),
    (2, 'Sales', 1),
    (3, 'Support', 2);

INSERT INTO users (id, name, department_id, active) VALUES
    (1, 'Alice', 1, TRUE),
    (2, 'Bob', 1, TRUE),
    (3, 'Charlie', 2, TRUE),
    (4, 'David', 2, TRUE),
    (5, 'Eve', 3, TRUE),
    (6, 'Frank', 3, TRUE);

INSERT INTO categories (id, name) VALUES
    (1, 'Hardware'),
    (2, 'Software'),
    (3, 'Books');

INSERT INTO products (id, name, category_id, unit_price) VALUES
    (1, 'Mechanical Keyboard', 1, 129.95),
    (2, 'Wide-screen Monitor', 1, 349.50),
    (3, 'Database IDE License', 2, 199.00),
    (4, 'Distributed Systems Handbook', 3, 74.25),
    (5, 'Observability Field Guide', 3, 59.90);

INSERT INTO customer_orders (id, user_id, status, total_amount, created_at) VALUES
    (101, 1, 'SHIPPED', 479.45, TIMESTAMP '2026-07-21 09:15:00'),
    (102, 1, 'PROCESSING', 199.00, TIMESTAMP '2026-07-28 14:30:00'),
    (103, 2, 'SHIPPED', 204.20, TIMESTAMP '2026-07-22 11:00:00'),
    (104, 3, 'NEW', 349.50, TIMESTAMP '2026-07-30 08:45:00'),
    (105, 4, 'CANCELLED', 129.95, TIMESTAMP '2026-07-24 16:20:00'),
    (106, 5, 'SHIPPED', 134.15, TIMESTAMP '2026-07-18 10:10:00'),
    (107, 6, 'PROCESSING', 258.90, TIMESTAMP '2026-07-29 13:05:00');

INSERT INTO order_items (order_id, product_id, quantity) VALUES
    (101, 1, 1),
    (101, 2, 1),
    (102, 3, 1),
    (103, 1, 1),
    (103, 4, 1),
    (104, 2, 1),
    (105, 1, 1),
    (106, 4, 1),
    (106, 5, 1),
    (107, 1, 2);

INSERT INTO roles (id, name) VALUES
    (1, 'Developer'),
    (2, 'Manager'),
    (3, 'Support Agent');

INSERT INTO permissions (id, name) VALUES
    (1, 'READ_REPORTS'),
    (2, 'EDIT_ORDERS'),
    (3, 'MANAGE_USERS'),
    (4, 'HANDLE_TICKETS');

INSERT INTO user_roles (user_id, role_id) VALUES
    (1, 1),
    (1, 2),
    (2, 1),
    (3, 2),
    (4, 2),
    (5, 3),
    (6, 3);

INSERT INTO role_permissions (role_id, permission_id) VALUES
    (1, 1),
    (1, 2),
    (2, 1),
    (2, 2),
    (2, 3),
    (3, 1),
    (3, 4);
