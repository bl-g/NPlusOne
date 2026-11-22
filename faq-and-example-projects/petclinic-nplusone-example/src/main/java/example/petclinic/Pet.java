package example.petclinic;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;

@Entity
class Pet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    private Owner owner;

    @OneToMany(mappedBy = "pet", cascade = CascadeType.ALL)
    private List<Visit> visits = new ArrayList<>();

    protected Pet() {
    }

    Pet(
            String name) {
        this.name = name;
    }

    void setOwner(
            Owner owner) {
        this.owner = owner;
    }

    void addVisit(
            Visit visit) {
        visits.add(visit);
        visit.setPet(this);
    }

    Long getId() {
        return id;
    }

    String getName() {
        return name;
    }

    List<Visit> getVisits() {
        return visits;
    }
}
