from rest_framework import serializers

from .models import (
    Card,
    DailyRemittance,
    DispatchRound,
    FareManifestEntry,
    ManifestTrip,
    Passenger,
    Route,
    Transaction,
    Trip,
    Vehicle,
)


class PassengerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Passenger
        fields = '__all__'


class PassengerNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Passenger
        fields = ['id', 'full_name']


class CardSerializer(serializers.ModelSerializer):
    passenger_details = PassengerNameSerializer(source='passenger', read_only=True)

    class Meta:
        model = Card
        fields = '__all__'


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = '__all__'


class TripSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = '__all__'


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'


class RouteSerializer(serializers.ModelSerializer):
    discount_fare = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Route
        fields = '__all__'


class DispatchRoundSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispatchRound
        fields = '__all__'


class DailyRemittanceSerializer(serializers.ModelSerializer):
    gross = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = DailyRemittance
        fields = '__all__'


class ManifestTripSerializer(serializers.ModelSerializer):
    is_finalized = serializers.BooleanField(read_only=True)
    finalized_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = ManifestTrip
        fields = '__all__'


class RouteFareSerializer(serializers.ModelSerializer):
    discount_fare = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Route
        fields = ['id', 'destination_name', 'base_fare', 'discount_fare']


class FareManifestEntrySerializer(serializers.ModelSerializer):
    route_details = RouteFareSerializer(source='route', read_only=True)

    def validate(self, attrs):
        passenger_count = attrs.get('passenger_count')
        discount_count = attrs.get('discount_count', 0)

        # Handle partial updates by falling back to existing instance values.
        if self.instance is not None:
            if passenger_count is None:
                passenger_count = self.instance.passenger_count
            if discount_count is None:
                discount_count = self.instance.discount_count

        if (
            passenger_count is not None
            and discount_count is not None
            and discount_count > passenger_count
        ):
            raise serializers.ValidationError(
                {
                    'discount_count': (
                        'discount_count cannot be greater than passenger_count.'
                    )
                }
            )

        return attrs

    class Meta:
        model = FareManifestEntry
        fields = '__all__'
