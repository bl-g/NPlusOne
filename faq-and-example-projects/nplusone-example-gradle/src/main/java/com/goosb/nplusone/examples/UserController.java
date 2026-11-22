package com.goosb.nplusone.examples;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public final class UserController {

    private final UserDemoService userDemoService;

    public UserController(
            UserDemoService userDemoService) {
        this.userDemoService = userDemoService;
    }

    @GetMapping("/")
    public Map<String, String> index() {
        Map<String, String> endpoints = new LinkedHashMap<>();
        endpoints.put("/demo/no-n-plus-one", "One long bulk query with several JOINs; no N+1 issue");
        endpoints.put("/demo/one-n-plus-one", "One repeated long JOIN query; one potential N+1 issue");
        endpoints.put("/demo/multiple-n-plus-one", "Two repeated long JOIN queries; two potential N+1 issues");
        endpoints.put("/test", "Alias for /demo/multiple-n-plus-one");
        return endpoints;
    }

    @GetMapping("/demo/no-n-plus-one")
    public List<Map<String, Object>> noNPlusOne() {
        return userDemoService.noNPlusOne();
    }

    @GetMapping("/demo/one-n-plus-one")
    public Map<String, Object> oneNPlusOne() {
        return userDemoService.oneNPlusOne();
    }

    @GetMapping({"/demo/multiple-n-plus-one", "/test"})
    public Map<String, Object> multipleNPlusOne() {
        return userDemoService.multipleNPlusOne();
    }
}
