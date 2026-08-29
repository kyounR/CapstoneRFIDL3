from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password

from .models import (
    Card,
    AdminAuditLog,
    DailyRemittance,
    Destination,
    Dispatcher,
    DispatchRound,
    Driver,
    FareManifestEntry,
    FeeSettings,
    Line,
    ManifestCorrection,
    ManifestTrip,
    Passenger,
    RemittanceCorrection,
    Terminal,
    Transaction,
    Trip,
    User,
    Vehicle,
)


class AdminAuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True, allow_null=True)

    class Meta:
        model = AdminAuditLog
        fields = ['id', 'actor', 'actor_username', 'action', 'model_name', 'object_repr', 'changes', 'timestamp']


class UserAdminSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'password', 'role', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


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
    line_name = serializers.CharField(source='line.name', read_only=True)

    class Meta:
        model = Vehicle
        fields = '__all__'


class TerminalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Terminal
        fields = '__all__'


class DriverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = '__all__'


class DispatcherSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dispatcher
        fields = '__all__'


class TripSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = '__all__'


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'


class DestinationSerializer(serializers.ModelSerializer):
    discount_fare = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Destination
        fields = '__all__'


class LineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Line
        fields = '__all__'


class FeeSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeSettings
        fields = '__all__'


class DispatchRoundSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispatchRound
        fields = '__all__'


class DailyRemittanceSerializer(serializers.ModelSerializer):
    cashier = serializers.PrimaryKeyRelatedField(read_only=True)
    is_finalized = serializers.BooleanField(read_only=True)
    finalized_at = serializers.DateTimeField(read_only=True)
    terminal_fee_percentage = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    terminal_fee = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gross = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    net_pay = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = DailyRemittance
        fields = '__all__'


class ManifestEntrySummarySerializer(serializers.ModelSerializer):
    destination = serializers.IntegerField(source='destination.id', read_only=True)
    destination_name = serializers.CharField(source='destination.destination_name', read_only=True)

    class Meta:
        model = FareManifestEntry
        fields = ['destination', 'destination_name', 'passenger_count', 'discount_count', 'total_fare']


class ManifestTripSerializer(serializers.ModelSerializer):
    cashier = serializers.PrimaryKeyRelatedField(read_only=True)
    cashier_username = serializers.CharField(source='cashier.username', read_only=True)
    is_finalized = serializers.BooleanField(read_only=True)
    finalized_at = serializers.DateTimeField(read_only=True)
    total_passengers = serializers.IntegerField(read_only=True)
    total_fare = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    entries = ManifestEntrySummarySerializer(many=True, read_only=True)

    class Meta:
        model = ManifestTrip
        fields = '__all__'


class DestinationFareSerializer(serializers.ModelSerializer):
    discount_fare = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Destination
        fields = ['id', 'destination_name', 'base_fare', 'discount_fare']


class FareManifestEntrySerializer(serializers.ModelSerializer):
    destination_details = DestinationFareSerializer(source='destination', read_only=True)

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


class ManifestCorrectionSerializer(serializers.ModelSerializer):
    admin_username = serializers.CharField(source='admin.username', read_only=True)
    destination_name = serializers.CharField(
        source='entry.destination.destination_name',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = ManifestCorrection
        fields = '__all__'


class RemittanceCorrectionSerializer(serializers.ModelSerializer):
    admin_username = serializers.CharField(source='admin.username', read_only=True)
    dispatch_round_number = serializers.IntegerField(source='dispatch_round.round_number', read_only=True)

    class Meta:
        model = RemittanceCorrection
        fields = '__all__'
