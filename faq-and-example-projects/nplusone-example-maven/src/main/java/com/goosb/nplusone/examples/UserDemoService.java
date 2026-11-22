package com.goosb.nplusone.examples;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public final class UserDemoService {

    private static final String ALL_USERS_WITH_ORDER_TOTALS_SQL = """
            SELECT
                u.id AS user_id,
                u.name AS user_name,
                d.name AS department_name,
                r.name AS region_name,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.quantity * p.unit_price), 0) AS total_order_value
            FROM users u
            JOIN departments d ON d.id = u.department_id
            JOIN regions r ON r.id = d.region_id
            LEFT JOIN customer_orders o ON o.user_id = u.id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            GROUP BY u.id, u.name, d.name, r.name
            ORDER BY u.id
            """;

    private static final String USERS_SQL = """
            SELECT
                u.id,
                u.name,
                d.name AS department_name,
                r.name AS region_name
            FROM users u
            JOIN departments d ON d.id = u.department_id
            JOIN regions r ON r.id = d.region_id
            WHERE u.active = TRUE
            ORDER BY u.id
            """;

    private static final String ORDERS_FOR_USER_SQL = """
            SELECT
                o.id AS order_id,
                o.status AS order_status,
                o.total_amount,
                o.created_at,
                p.name AS product_name,
                c.name AS category_name,
                oi.quantity,
                p.unit_price,
                d.name AS department_name,
                r.name AS region_name
            FROM customer_orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN products p ON p.id = oi.product_id
            JOIN categories c ON c.id = p.category_id
            JOIN users u ON u.id = o.user_id
            JOIN departments d ON d.id = u.department_id
            JOIN regions r ON r.id = d.region_id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC, o.id, p.name
            """;

    private static final String ROLES_FOR_USER_SQL = """
            SELECT
                rle.id AS role_id,
                rle.name AS role_name,
                perm.name AS permission_name,
                dept.name AS department_name,
                reg.name AS region_name
            FROM user_roles ur
            JOIN roles rle ON rle.id = ur.role_id
            JOIN role_permissions rp ON rp.role_id = rle.id
            JOIN permissions perm ON perm.id = rp.permission_id
            JOIN users usr ON usr.id = ur.user_id
            JOIN departments dept ON dept.id = usr.department_id
            JOIN regions reg ON reg.id = dept.region_id
            WHERE ur.user_id = ?
            ORDER BY rle.name, perm.name
            """;

    private final JdbcTemplate jdbcTemplate;

    public UserDemoService(
            JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Map<String, Object>> noNPlusOne() {
        return createBulkUserOverview();
    }

    public Map<String, Object> oneNPlusOne() {
        return createUserAndOrderOverview();
    }

    public Map<String, Object> multipleNPlusOne() {
        return createUserOrderAndRoleOverview();
    }

    private List<Map<String, Object>> createBulkUserOverview() {
        return loadAllUsersWithOrderTotals();
    }

    private Map<String, Object> createUserAndOrderOverview() {
        List<Map<String, Object>> users = loadActiveUsers();
        List<Map<String, Object>> orders = loadOrdersForUsers(users);

        return Map.of(
                "users", users,
                "orders", orders);
    }

    private Map<String, Object> createUserOrderAndRoleOverview() {
        List<Map<String, Object>> users = loadActiveUsers();
        List<Map<String, Object>> orders = loadOrdersForUsers(users);
        List<Map<String, Object>> roles = loadRolesForUsers(users);

        return Map.of(
                "users", users,
                "orders", orders,
                "roles", roles);
    }

    private List<Map<String, Object>> loadOrdersForUsers(
            List<Map<String, Object>> users) {
        List<Map<String, Object>> orders = new ArrayList<>();

        for(Map<String, Object> user : users) {
            orders.addAll(loadOrdersForUser(getLong(user, "id")));
        }

        return orders;
    }

    private List<Map<String, Object>> loadRolesForUsers(
            List<Map<String, Object>> users) {
        List<Map<String, Object>> roles = new ArrayList<>();

        for(Map<String, Object> user : users) {
            roles.addAll(loadRolesForUser(getLong(user, "id")));
        }

        return roles;
    }

    private List<Map<String, Object>> loadAllUsersWithOrderTotals() {
        return executeQuery(ALL_USERS_WITH_ORDER_TOTALS_SQL);
    }

    private List<Map<String, Object>> loadActiveUsers() {
        return executeQuery(USERS_SQL);
    }

    private List<Map<String, Object>> loadOrdersForUser(
            long userId) {
        return executeQuery(
                ORDERS_FOR_USER_SQL,
                userId);
    }

    private List<Map<String, Object>> loadRolesForUser(
            long userId) {
        return executeQuery(
                ROLES_FOR_USER_SQL,
                userId);
    }

    private List<Map<String, Object>> executeQuery(
            String sql,
            Object... arguments) {
        return jdbcTemplate.queryForList(
                sql,
                arguments);
    }

    private static long getLong(
            Map<String, Object> row,
            String columnName) {
        Object value = row.entrySet().stream()
                .filter(entry -> columnName.equalsIgnoreCase(entry.getKey()))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Missing column " + columnName));

        return ((Number) value).longValue();
    }
}
