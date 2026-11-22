package com.goosb.nplusone.frontend;

import com.goosb.nplusone.common.ConfigProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public final class QueryingOperationPageController {

    private final String backendUrl;
    private final boolean callRequestsTasks;
    private final boolean hideProxyFrames;

    public QueryingOperationPageController(
            Environment environment) {
        this.backendUrl = environment.getRequiredProperty(ConfigProperty.BACKEND_URL.getName());
        this.hideProxyFrames = environment.getProperty(
                ConfigProperty.UI_HIDE_PROXY_FRAMES.getName(),
                Boolean.class,
                true);
        this.callRequestsTasks = environment.getProperty(
                "nplusone.call.requests.tasks",
                Boolean.class,
                false);
    }

    @GetMapping("/")
    public String root() {
        return "redirect:/live";
    }

    @GetMapping("/live")
    public String live(
            Model model) {
        model.addAttribute("streamUrl", backendUrl + "/live");
        model.addAttribute("callRequestsTasks", callRequestsTasks);
        model.addAttribute("hideProxyFrames", hideProxyFrames);
        return "index";
    }

    @GetMapping("/search-page")
    public String searchPage(
            Model model) {
        model.addAttribute("searchPageUrl", backendUrl + "/search-page");
        model.addAttribute("callRequestsTasks", callRequestsTasks);
        model.addAttribute("hideProxyFrames", hideProxyFrames);
        return "search-page";
    }
}
