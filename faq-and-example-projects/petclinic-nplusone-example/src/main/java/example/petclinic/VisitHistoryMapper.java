package example.petclinic;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
class VisitHistoryMapper {

    List<String> toDescriptions(
            Pet pet) {
        return describeVisits(pet.getVisits());
    }

    private List<String> describeVisits(
            List<Visit> visits) {
        List<String> descriptions = new ArrayList<>();
        // Iterating the lazy collection deliberately triggers one SELECT per pet.
        for(Visit visit : visits) {
            descriptions.add(visit.getDescription());
        }
        return List.copyOf(descriptions);
    }
}
