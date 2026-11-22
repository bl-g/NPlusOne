package example.petclinic;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;

@Entity
class Visit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    private Pet pet;

    protected Visit() {
    }

    Visit(
            String description) {
        this.description = description;
    }

    void setPet(
            Pet pet) {
        this.pet = pet;
    }

    String getDescription() {
        return description;
    }
}
