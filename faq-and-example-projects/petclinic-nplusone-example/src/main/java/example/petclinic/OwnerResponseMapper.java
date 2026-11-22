package example.petclinic;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
class OwnerResponseMapper {

    private final VisitHistoryMapper visitHistoryMapper;

    OwnerResponseMapper(
            VisitHistoryMapper visitHistoryMapper) {
        this.visitHistoryMapper = visitHistoryMapper;
    }

    List<OwnerResponse> toResponses(
            List<Owner> owners,
            boolean includeVisits) {
        List<OwnerResponse> responses = new ArrayList<>(owners.size());
        for(Owner owner : owners) {
            responses.add(toResponse(owner, includeVisits));
        }
        return List.copyOf(responses);
    }

    OwnerResponse toResponse(
            Owner owner,
            boolean includeVisits) {
        List<PetResponse> pets = createPetProfiles(owner, includeVisits);
        return new OwnerResponse(owner.getId(), owner.getName(), pets);
    }

    private List<PetResponse> createPetProfiles(
            Owner owner,
            boolean includeVisits) {
        return mapPets(owner.getPets(), includeVisits);
    }

    private List<PetResponse> mapPets(
            List<Pet> pets,
            boolean includeVisits) {
        List<PetResponse> responses = new ArrayList<>();
        // Iterating the lazy collection deliberately triggers one SELECT per owner.
        for(Pet pet : pets) {
            responses.add(toPetResponse(pet, includeVisits));
        }
        return List.copyOf(responses);
    }

    private PetResponse toPetResponse(
            Pet pet,
            boolean includeVisits) {
        List<String> visits = includeVisits
                ? visitHistoryMapper.toDescriptions(pet)
                : List.of();
        return new PetResponse(pet.getId(), pet.getName(), visits);
    }

    record OwnerResponse(
            Long id,
            String name,
            List<PetResponse> pets) {
    }

    record PetResponse(
            Long id,
            String name,
            List<String> visits) {
    }
}
