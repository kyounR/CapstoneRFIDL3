from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q, Sum


class User(AbstractUser):
	class Role(models.TextChoices):
		ADMIN = 'admin', 'Admin'
		CASHIER = 'cashier', 'Cashier'

	role = models.CharField(max_length=20, choices=Role.choices, default=Role.CASHIER)

	def __str__(self):
		return f"{self.username} ({self.role})"


class Passenger(models.Model):
	class DiscountType(models.TextChoices):
		REGULAR = 'regular', 'Regular'
		STUDENT = 'student', 'Student'
		SENIOR = 'senior', 'Senior'
		PWD = 'pwd', 'PWD'

	full_name = models.CharField(max_length=255)
	contact_number = models.CharField(max_length=30, blank=True, null=True)
	discount_type = models.CharField(
		max_length=20,
		choices=DiscountType.choices,
		default=DiscountType.REGULAR,
	)
	date_registered = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return self.full_name


class Destination(models.Model):
	destination_name = models.CharField(max_length=255)
	base_fare = models.DecimalField(max_digits=10, decimal_places=2)
	discount_exempt = models.BooleanField(default=False)
	capacity_limit = models.PositiveIntegerField(
		null=True,
		blank=True,
		validators=[MinValueValidator(1)],
	)
	is_active = models.BooleanField(default=True)

	@property
	def discount_fare(self):
		if self.discount_exempt:
			return self.base_fare
		return self.base_fare - Decimal('5.00')

	def __str__(self):
		return self.destination_name


class Card(models.Model):
	class Status(models.TextChoices):
		ACTIVE = 'active', 'Active'
		LOST = 'lost', 'Lost'
		DEACTIVATED = 'deactivated', 'Deactivated'

	uid = models.CharField(max_length=100, unique=True)
	passenger = models.ForeignKey(
		Passenger,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name='cards',
	)
	balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
	date_issued = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return f"{self.uid} - {self.status}"


class Line(models.Model):
	name = models.CharField(max_length=255, unique=True)

	def __str__(self):
		return self.name


class Terminal(models.Model):
	name = models.CharField(max_length=255, unique=True)

	def __str__(self):
		return self.name


class Driver(models.Model):
	full_name = models.CharField(max_length=255)
	contact_number = models.CharField(max_length=30, blank=True, null=True)

	def __str__(self):
		return self.full_name


class FeeSettings(models.Model):
	terminal_fee_percentage = models.DecimalField(
		max_digits=12,
		decimal_places=2,
		default=Decimal('10.00'),
	)
	ps_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	water_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	dispatcher_collection_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	ftb = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	savings = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	trust_fund = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	updated_at = models.DateTimeField(auto_now=True)

	def save(self, *args, **kwargs):
		self.pk = 1
		super().save(*args, **kwargs)

	@classmethod
	def get_current(cls):
		return cls.objects.get_or_create(pk=1)[0]

	def __str__(self):
		return 'Current fee settings'


class Vehicle(models.Model):
	plate_number = models.CharField(max_length=20, unique=True)
	line = models.ForeignKey(Line, on_delete=models.PROTECT, related_name='vehicles')
	passenger_capacity = models.PositiveIntegerField(
		null=True,
		blank=True,
		validators=[MinValueValidator(1)],
	)
	is_light_vehicle = models.BooleanField(default=False)
	assigned_driver = models.ForeignKey(
		Driver,
		null=True,
		blank=True,
		on_delete=models.SET_NULL,
		related_name='assigned_vehicles',
	)
	is_active = models.BooleanField(default=True)

	def __str__(self):
		return f"{self.plate_number} ({self.line.name})"


class Trip(models.Model):
	class Status(models.TextChoices):
		ONGOING = 'ongoing', 'Ongoing'
		COMPLETED = 'completed', 'Completed'

	vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='trips')
	date = models.DateField()
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.ONGOING)
	start_time = models.TimeField()
	end_time = models.TimeField(null=True, blank=True)

	def __str__(self):
		return f"{self.vehicle.plate_number} - {self.date} ({self.status})"


class DailyRemittance(models.Model):
	terminal = models.ForeignKey(Terminal, on_delete=models.PROTECT, related_name='daily_remittances')
	cashier = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='daily_remittances',
	)
	dispatcher_name = models.CharField(max_length=255)
	date = models.DateField()
	driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name='daily_remittances')
	original_assigned_driver = models.ForeignKey(
		Driver,
		null=True,
		on_delete=models.SET_NULL,
		related_name='+',
	)
	vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='daily_remittances')
	substitute_fee = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
	terminal_fee_percentage = models.DecimalField(max_digits=12, decimal_places=2)
	ps_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	water_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	dispatcher_collection_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	ftb = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	savings = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	trust_fund = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	is_finalized = models.BooleanField(default=False)
	finalized_at = models.DateTimeField(null=True, blank=True)

	@property
	def gross(self):
		return DispatchRound.objects.filter(remittance=self).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

	@property
	def terminal_fee(self):
		return self.gross * (self.terminal_fee_percentage / Decimal('100.00'))

	@property
	def subtotal(self):
		return self.gross - self.terminal_fee

	def __str__(self):
		return f"{self.date} - {self.driver.full_name} ({self.vehicle.plate_number})"


class DispatchRound(models.Model):
	remittance = models.ForeignKey(
		DailyRemittance,
		on_delete=models.PROTECT,
		related_name='rounds',
	)
	round_number = models.PositiveSmallIntegerField(
		validators=[MinValueValidator(1), MaxValueValidator(5)]
	)
	amount = models.DecimalField(max_digits=12, decimal_places=2)
	departure_time = models.TimeField()

	class Meta:
		constraints = [
			models.UniqueConstraint(
				fields=['remittance', 'round_number'],
				name='unique_round_number_per_remittance',
			)
		]

	def __str__(self):
		return f"{self.remittance.driver.full_name} - Round {self.round_number}"


class ManifestTrip(models.Model):
	vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='manifest_trips')
	trip = models.ForeignKey(
		Trip,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name='manifest_trips',
	)
	date = models.DateField()
	departure_time = models.TimeField(null=True, blank=True)
	is_finalized = models.BooleanField(default=False)
	finalized_at = models.DateTimeField(null=True, blank=True)
	cashier = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='manifest_trips',
	)

	@property
	def total_passengers(self):
		return FareManifestEntry.objects.filter(manifest_trip=self).aggregate(
			total=models.Sum('passenger_count')
		)['total'] or 0

	@property
	def total_fare(self):
		return FareManifestEntry.objects.filter(manifest_trip=self).aggregate(
			total=models.Sum('total_fare')
		)['total'] or Decimal('0.00')

	def __str__(self):
		return f"{self.date} - {self.vehicle.plate_number} ({self.departure_time})"


class FareManifestEntry(models.Model):
	class Source(models.TextChoices):
		RFID = 'rfid', 'RFID'
		MANUAL = 'manual', 'Manual'

	manifest_trip = models.ForeignKey(
		ManifestTrip,
		on_delete=models.PROTECT,
		related_name='entries',
	)
	destination = models.ForeignKey(Destination, on_delete=models.PROTECT, related_name='manifest_entries')
	passenger_count = models.PositiveIntegerField()
	discount_count = models.PositiveIntegerField(default=0)
	total_fare = models.DecimalField(max_digits=12, decimal_places=2)
	source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)

	class Meta:
		constraints = [
			models.CheckConstraint(
				condition=Q(discount_count__lte=F('passenger_count')),
				name='discount_count_lte_passenger_count',
			),
			models.UniqueConstraint(
				fields=['manifest_trip', 'destination'],
				name='unique_destination_per_manifest_trip',
			),
		]

	def __str__(self):
		return f"{self.manifest_trip} - {self.destination.destination_name}"


class ManifestCorrection(models.Model):
	manifest_trip = models.ForeignKey(
		ManifestTrip,
		on_delete=models.PROTECT,
		related_name='corrections',
	)
	entry = models.ForeignKey(
		FareManifestEntry,
		on_delete=models.PROTECT,
		null=True,
		blank=True,
		related_name='corrections',
	)
	field_name = models.CharField(max_length=50)
	old_value = models.CharField(max_length=255)
	new_value = models.CharField(max_length=255)
	reason = models.TextField()
	admin = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='manifest_corrections',
	)
	corrected_at = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return f"{self.manifest_trip} - {self.field_name}"


class Transaction(models.Model):
	class TransactionType(models.TextChoices):
		TOPUP = 'topup', 'Top-up'
		FARE = 'fare', 'Fare'

	card = models.ForeignKey(Card, on_delete=models.PROTECT, related_name='transactions')
	cashier = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		null=True,
		blank=True,
		related_name='transactions',
	)
	transaction_type = models.CharField(max_length=20, choices=TransactionType.choices)
	amount = models.DecimalField(max_digits=12, decimal_places=2)
	trip = models.ForeignKey(
		Trip,
		on_delete=models.PROTECT,
		null=True,
		blank=True,
		related_name='transactions',
	)
	destination = models.ForeignKey(
		Destination,
		on_delete=models.PROTECT,
		null=True,
		blank=True,
		related_name='transactions',
	)
	balance_after = models.DecimalField(max_digits=12, decimal_places=2)
	timestamp = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return f"{self.card.uid} - {self.transaction_type} {self.amount}"
