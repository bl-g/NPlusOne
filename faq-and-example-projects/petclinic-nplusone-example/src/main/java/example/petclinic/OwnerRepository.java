package example.petclinic;

import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

interface OwnerRepository extends JpaRepository<Owner, Long> {

    @EntityGraph(attributePaths = "pets")
    List<Owner> findAllWithPetsBy();
}
