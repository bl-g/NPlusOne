package example.petclinic;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class OwnerController {

    private final ClinicQueryService clinicQueryService;

    OwnerController(
            ClinicQueryService clinicQueryService) {
        this.clinicQueryService = clinicQueryService;
    }

    @GetMapping("/")
    Map<String, String> index() {
        Map<String, String> endpoints = new LinkedHashMap<>();
        endpoints.put("/api/owners", "Owner directory with pet profiles");
        endpoints.put("/api/owners/visit-history", "Owner directory with pets and visit histories");
        endpoints.put("/api/owners/summaries", "Owner summaries with pet profiles");
        return endpoints;
    }

    @GetMapping("/api/owners")
    List<OwnerResponseMapper.OwnerResponse> owners() {
        return clinicQueryService.owners();
    }

    @GetMapping("/api/owners/visit-history")
    List<OwnerResponseMapper.OwnerResponse> ownersVisitHistory() {
        return clinicQueryService.ownersVisitHistory();
    }

    @GetMapping("/api/owners/summaries")
    List<OwnerResponseMapper.OwnerResponse> ownersSummaries() {
        return clinicQueryService.ownersSummaries();
    }
}
