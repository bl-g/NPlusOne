package com.goosb.nplusone.examples;

import com.goosb.nplusone.test.AssertNoNPlusOneQueryPatterns;
import com.goosb.nplusone.test.NPlusOneTestJupiterExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ExtendWith(NPlusOneTestJupiterExtension.class)
class UserDemoServiceTest {

    @Autowired
    private UserDemoService service;

    @Test
    @AssertNoNPlusOneQueryPatterns
    void bulkOverviewHasNoNPlusOneQueries() {
        var users = service.noNPlusOne();

        assertThat(users).hasSize(6);
        assertThat(users.get(0)).containsEntry("USER_NAME", "Alice");
        assertThat(((Number) users.get(0).get("ORDER_COUNT")).intValue()).isEqualTo(2);
    }

    @Test
    @AssertNoNPlusOneQueryPatterns(maxNPlusOneIssues = 1)
    void orderOverviewAllowsOneKnownNPlusOnePattern() {
        // Lower the allowance to zero to see NPlusOne reject the per-user order queries.
        var overview = service.oneNPlusOne();

        assertThat((List<?>) overview.get("users")).hasSize(6);
        assertThat((List<?>) overview.get("orders")).hasSize(10);
    }

    @Test
    @AssertNoNPlusOneQueryPatterns(maxNPlusOneIssues = 2)
    void orderAndRoleOverviewAllowsTwoKnownNPlusOnePatterns() {
        // Orders and roles are each loaded once per user from separate call sites.
        var overview = service.multipleNPlusOne();

        assertThat((List<?>) overview.get("users")).hasSize(6);
        assertThat((List<?>) overview.get("orders")).hasSize(10);
        assertThat((List<?>) overview.get("roles")).hasSize(17);
    }
}

