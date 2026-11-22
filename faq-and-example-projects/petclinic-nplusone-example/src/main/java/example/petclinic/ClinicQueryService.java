package example.petclinic;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ClinicQueryService {

    private final OwnerRepository ownerRepository;
    private final OwnerResponseMapper ownerResponseMapper;

    ClinicQueryService(
            OwnerRepository ownerRepository,
            OwnerResponseMapper ownerResponseMapper) {
        this.ownerRepository = ownerRepository;
        this.ownerResponseMapper = ownerResponseMapper;
    }

    @Transactional(readOnly = true)
    List<OwnerResponseMapper.OwnerResponse> owners() {
        return buildOwnerDirectory(false, false);
    }

    @Transactional(readOnly = true)
    List<OwnerResponseMapper.OwnerResponse> ownersVisitHistory() {
        return buildOwnerDirectory(true, false);
    }

    @Transactional(readOnly = true)
    List<OwnerResponseMapper.OwnerResponse> ownersSummaries() {
        return buildOwnerDirectory(false, true);
    }

    private List<OwnerResponseMapper.OwnerResponse> buildOwnerDirectory(
            boolean includeVisits,
            boolean fetchPets) {
        List<Owner> owners = loadOwners(fetchPets);
        return ownerResponseMapper.toResponses(owners, includeVisits);
    }

    private List<Owner> loadOwners(
            boolean fetchPets) {
        if(fetchPets) {
            return ownerRepository.findAllWithPetsBy();
        }
        return ownerRepository.findAll();
    }
}
